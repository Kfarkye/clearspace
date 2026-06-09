import sys
from aura.core.artifact_provisioning_pipeline import ArtifactProvisioningPipeline
import json

def run_checks():
    print("--- RUNNING GOVERNANCE CHECKS ---")
    pipeline = ArtifactProvisioningPipeline()
    
    # Check 1: Unprivileged deployer on HIGH sensitivity artifact
    unprivileged_principal = {"principal_id": "intern_user", "roles": ["developer"]}
    sensitive_manifest = {
        "deployment_id": "core-engine-v2",
        "sensitivity_level": "HIGH",
        "personal_email": "ceo@enterprise.com",
        "authentication_token": "secret_token_123"
    }
    
    print("\nAttempting deployment with unprivileged principal...")
    try:
        pipeline.provision_artifact_for_deployment(sensitive_manifest, unprivileged_principal)
        print("FAIL: Deployment was allowed but should have been denied.")
        sys.exit(1)
    except PermissionError as e:
        print(f"PASS: Deployment successfully denied with PermissionError: {e}")
        
    # Check 2: Successful governance application with redaction
    authorized_principal = {"principal_id": "release_admin", "roles": ["release_manager"]}
    print("\nAttempting deployment with authorized principal...")
    try:
        governed_manifest = pipeline.provision_artifact_for_deployment(sensitive_manifest, authorized_principal)
        print("PASS: Deployment allowed for authorized principal.")
        
        if governed_manifest.get("personal_email") == "[ENTERPRISE_REDACTED_BY_POLICY]" and \
           governed_manifest.get("authentication_token") == "[ENTERPRISE_REDACTED_BY_POLICY]":
            print("PASS: Sensitive fields were properly redacted in the governed manifest.")
        else:
            print("FAIL: Sensitive fields were NOT properly redacted.")
            sys.exit(1)
    except Exception as e:
        print(f"FAIL: Deployment failed for authorized principal: {e}")
        sys.exit(1)
        
    # Check 3: Audit Logs
    print("\nReviewing Audit Logs...")
    audit_logs = pipeline.enterprise_governance_service.audit_log_stream
    for log in audit_logs:
        print(json.dumps(log, indent=2))
        
    if len(audit_logs) >= 3:
        print("PASS: Audit logs were successfully generated and recorded.")
    else:
        print("FAIL: Audit logs were not generated as expected.")
        sys.exit(1)

if __name__ == "__main__":
    run_checks()
