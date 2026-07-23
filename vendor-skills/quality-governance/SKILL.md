---
name: quality-governance
description: >
  Review a refactored agent and its skills for production readiness, including completeness, correctness, and quality of the agent's orchestration logic, skill usage, and failure handling. Check completeness, overlap, missing guardrails, unsupported assumptions, validation coverage, observability, versioning, and rollback readiness. Use before production release.
license : Apache-2.0
compatibility: >
  Requires the refactored orchestrator and skill package. 
metadata:
  skill-type: evaluation
  skill-category: governance
  skill-subcategory: quality
  skill-version: 1.0.0
allowed-tools: Read Write
---

## Purpose 
Perform a final hardening and governance review of a refactored agent and its skills before production release. This skill is useful for ensuring that the agent is complete, correct, and ready for production use.

## Checklist
### Structural
- Are skill names and descriptions clear, concise, and consistent?
- Are skill categories and subcategories appropriate?
- Does each skill have a single responsibility and a clear purpose?
- Are skill inputs and outputs well-defined and documented?
- Are skill dependencies and interactions clearly defined?
- Are skill versions and change logs up-to-date?
- Are references/assets/scripts correctly separated?
- In the orchestration thin layer, are skill calls minimal and well-structured?

### OOperational
- Are all required guardrails and policies implemented and enforced?
- Are all assumptions about tools, files, and data clearly documented and validated?
- Are all failure handling and recovery mechanisms in place and tested?
- Are all validation criteria and test cases defined and executed?
- Are all observability and monitoring mechanisms in place and tested?
- Are validation steps explicitly defined and executed?
- Are edge cases and error scenarios considered and handled?
- Is fallback and rollback strategy defined?

### Production Readiness
- Are version metadata present? 
- Are quality gates defined?
- Are risks and known limitations documented?
- Is there an upgrade/ rollback note?

## Output Format
### Pass / Concerns 
### Mandatory Fixes
### Recommended Improvements
### Release Verdict

## Guardrails
- Do not approve if orchestration and skill boundaries are not clear and well-defined.
- Do not approve if critical assumptions are implicit and not validated.
- Do not approve if failure handling and recovery mechanisms are missing or untested.
- Distinguish between mandatory fixes from optional design improvements.

