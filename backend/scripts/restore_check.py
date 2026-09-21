"""Restore a decrypted backup into a scratch database and compare row counts with the source.

Run from backend/: python -m scripts.restore_check journal.pgdump [--source URL] [--pg-restore PATH]

The scratch database is created on the source's server and dropped afterwards. Rows written to the source
after the dump was taken show up as mismatches, so check against a quiet database or a fresh dump.
"""

import argparse
import subprocess
import sys
import uuid

import psycopg
from psycopg import sql
from sqlalchemy.engine import make_url

from app.config import settings


def compare_counts(source: dict[str, int], restored: dict[str, int]) -> list[str]:
    problems = []
    for table in sorted(source.keys() | restored.keys()):
        if table not in restored:
            problems.append(f"{table}: missing after restore")
        elif table not in source:
            problems.append(f"{table}: not in source")
        elif source[table] != restored[table]:
            problems.append(f"{table}: source {source[table]}, restored {restored[table]}")
    return problems


def libpq_url(url: str, database: str | None = None) -> str:
    parsed = make_url(url).set(drivername="postgresql")
    if database:
        parsed = parsed.set(database=database)
    return parsed.render_as_string(hide_password=False)


def table_counts(conninfo: str) -> dict[str, int]:
    with psycopg.connect(conninfo) as conn:
        tables = [row[0] for row in conn.execute("select tablename from pg_tables where schemaname = 'public'")]
        return {
            table: conn.execute(sql.SQL("select count(*) from {}").format(sql.Identifier(table))).fetchone()[0]
            for table in tables
        }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("dump", help="decrypted pg_dump file in custom format")
    parser.add_argument("--source", default=settings.database_url, help="database the dump came from")
    parser.add_argument("--pg-restore", default="pg_restore", help="path to pg_restore, if not on PATH")
    args = parser.parse_args()

    scratch = f"restore_check_{uuid.uuid4().hex[:8]}"
    with psycopg.connect(libpq_url(args.source, "postgres"), autocommit=True) as admin:
        admin.execute(sql.SQL("create database {}").format(sql.Identifier(scratch)))
    try:
        # A new database already has a public schema, which the dump creates again.
        restore = subprocess.run(
            [
                args.pg_restore,
                "--clean",
                "--if-exists",
                "--no-owner",
                "--no-privileges",
                "--exit-on-error",
                "--dbname",
                libpq_url(args.source, scratch),
                args.dump,
            ],
            capture_output=True,
            text=True,
        )
        if restore.returncode != 0:
            print(f"pg_restore failed:\n{restore.stderr.strip()}", file=sys.stderr)
            return 1
        source_counts = table_counts(libpq_url(args.source))
        restored_counts = table_counts(libpq_url(args.source, scratch))
    finally:
        with psycopg.connect(libpq_url(args.source, "postgres"), autocommit=True) as admin:
            admin.execute(sql.SQL("drop database if exists {} with (force)").format(sql.Identifier(scratch)))

    for table in sorted(source_counts):
        print(f"{table:28} source {source_counts[table]:>7}  restored {restored_counts.get(table, 'missing')!s:>7}")
    problems = compare_counts(source_counts, restored_counts)
    if problems:
        print("\nMISMATCH:\n  " + "\n  ".join(problems), file=sys.stderr)
        return 1
    print(f"\nOK: {len(source_counts)} tables restored with matching row counts")
    return 0


if __name__ == "__main__":
    sys.exit(main())
