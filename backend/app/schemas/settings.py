from pydantic import BaseModel, ConfigDict, Field


class BandsOut(BaseModel):
    elite_min: int
    solid_min: int
    sub_optimal_min: int


class SettingsOut(BaseModel):
    compliance_cutoff: int
    bands: BandsOut
    low_sample_threshold: int
    elite_setup_min: int


class SettingsIn(BaseModel):
    """Only the cutoff is editable; the bands and thresholds are fixed constants."""

    model_config = ConfigDict(extra="forbid", strict=True)

    compliance_cutoff: int = Field(ge=0, le=100)
