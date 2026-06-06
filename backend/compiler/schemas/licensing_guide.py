from pydantic import BaseModel, Field
from typing import List, Optional

class OfficialSource(BaseModel):
    name: str = Field(..., description="Name of the official source organization")
    url: str = Field(..., description="URL to the official documentation")
    type: str = Field(..., description="Type of source (e.g., 'Primary Registry', 'Testing Provider')")

class LicensingStep(BaseModel):
    title: str = Field(..., description="Title of the step")
    description: str = Field(..., description="Detailed description of what is required")
    estimated_cost: Optional[str] = Field(None, description="Estimated cost for this step")
    estimated_time: Optional[str] = Field(None, description="Estimated time to complete")

class LicensingPath(BaseModel):
    name: str = Field(..., description="Name of the path (e.g., 'New Candidates', 'Out-of-State Reciprocity')")
    description: str = Field(..., description="Brief description of who this path is for")
    steps: List[LicensingStep] = Field(..., description="Ordered list of steps to complete this path")

class LicensingGuidePayload(BaseModel):
    title: str = Field(..., description="Main title of the guide")
    state: str = Field(..., description="State name (e.g., 'North Carolina')")
    profession: str = Field(..., description="Profession (e.g., 'CNA')")
    last_verified: str = Field(..., description="Date this information was last verified in YYYY-MM-DD format")
    overview: str = Field(..., description="A brief overview of the licensing requirements for this state")
    paths: List[LicensingPath] = Field(..., description="List of different paths to licensure")
    official_sources: List[OfficialSource] = Field(..., description="List of official sources used for verification")
