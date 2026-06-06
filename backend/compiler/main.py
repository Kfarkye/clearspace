from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
from pydantic import ValidationError
import os

from schemas import LicensingGuidePayload

app = FastAPI(title="Artifact Compiler", version="1.0.0")

# Setup Jinja2 templates pointing to the parent backend/templates directory
TEMPLATES_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "templates")
templates = Jinja2Templates(directory=TEMPLATES_DIR)

@app.post("/compile/licensing_guide", response_class=HTMLResponse)
async def compile_licensing_guide(request: Request, payload: LicensingGuidePayload):
    """
    Takes a validated LicensingGuidePayload and compiles it into an HTML document using Jinja2.
    """
    try:
        # Render the template with the provided payload
        return templates.TemplateResponse(
            "licensing_guide.html.jinja",
            {"request": request, "data": payload.model_dump()}
        )
    except Exception as e:
        print(f"ERROR: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to render template: {str(e)}")

@app.get("/health")
def health_check():
    return {"status": "ok", "service": "artifact-compiler"}

if __name__ == "__main__":
    import uvicorn
    # Run the compiler service on port 5002
    uvicorn.run("main:app", host="0.0.0.0", port=5002, reload=True)
