from decimal import Decimal

from app.schemas.fee import FeeTemplateComponent, FeeTemplateOut

# Illustrative amounts only. They are not any broker's published rates.
FEE_TEMPLATES: list[FeeTemplateOut] = [
    FeeTemplateOut(
        id="example-futures-per-fill",
        name="Example: futures, three fee lines per fill",
        description="Exchange, commission and regulatory fee charged on every fill. Replace the amounts with your tariff.",
        components=[
            FeeTemplateComponent(name="Exchange fee", amount=Decimal("1.60"), basis="per_fill"),
            FeeTemplateComponent(name="Broker commission", amount=Decimal("2.00"), basis="per_fill"),
            FeeTemplateComponent(name="Regulatory fee", amount=Decimal("0.06"), basis="per_fill"),
        ],
    ),
    FeeTemplateOut(
        id="example-commission-per-contract",
        name="Example: one commission per contract",
        description="A single commission multiplied by the contracts on each fill. Replace the amount with your tariff.",
        components=[
            FeeTemplateComponent(name="Commission", amount=Decimal("2.50"), basis="per_contract"),
        ],
    ),
]


def find_template(template_id: str) -> FeeTemplateOut | None:
    return next((t for t in FEE_TEMPLATES if t.id == template_id), None)
