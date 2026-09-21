from scripts.restore_check import compare_counts, libpq_url


def test_matching_counts_have_no_problems():
    counts = {"trades": 90, "setups": 4}
    assert compare_counts(counts, dict(counts)) == []


def test_a_short_table_is_reported_with_both_counts():
    problems = compare_counts({"trades": 90}, {"trades": 89})
    assert problems == ["trades: source 90, restored 89"]


def test_a_table_missing_after_restore_is_reported():
    assert compare_counts({"trades": 90, "setups": 4}, {"trades": 90}) == ["setups: missing after restore"]


def test_a_table_only_in_the_restore_is_reported():
    assert compare_counts({"trades": 90}, {"trades": 90, "extra": 1}) == ["extra: not in source"]


def test_empty_tables_that_match_are_fine():
    assert compare_counts({"trades": 0}, {"trades": 0}) == []


def test_libpq_url_drops_the_driver_and_swaps_the_database():
    url = libpq_url("postgresql+psycopg://journal:pw%40x@127.0.0.1:5433/journal", database="scratch")
    assert url == "postgresql://journal:pw%40x@127.0.0.1:5433/scratch"


def test_libpq_url_keeps_query_parameters():
    url = libpq_url("postgres://u:p@h:5432/db?sslmode=require")
    assert url == "postgresql://u:p@h:5432/db?sslmode=require"
