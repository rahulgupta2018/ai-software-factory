---
name: ontology-builder-assistant
description: >
  Derives a minimal, reusable, evidence-backed ontology from purpose statements, competency
  questions, sample data, reusable vocabularies, and constraints — with defensible CQ-to-model
  traceability and Turtle + SHACL serialization. Activates when asked to draft or bootstrap an
  ontology, an information-extraction schema, or a mapping-oriented semantic model. Handles
  enterprise concerns first-class: stable IRIs, temporal validity/point-in-time, provenance,
  authority precedence, confidence, jurisdiction, classification/tenancy, and governance. Owns
  ontology design. Does not own runtime retrieval over a built graph or answer synthesis.
license: MIT
metadata:
  author: community (adapted for this library)
  version: "1.1.0"
  last_updated: 2026-07-02
  category: knowledge
---

# Ontology Builder Assistant

## Overview

Derive a small reusable ontology that is purpose-led, evidence-backed, and aggressively scoped.
Treat the use case description and competency questions as the semantic blueprint. Treat sample data as evidence for inclusion, not as the ontology boundary.

**Freedom level: LOW** — the gated workflow (requirement gate → evidence gate → dimensions →
serialization) is the method; follow it in order.

**Project binding.** When `.agents/project-context.yaml` exists, take the authority ranking from
`${ctx.authority_hierarchy}`, applicable jurisdictions from `${ctx.jurisdictions}`, and
classification/tenancy from `${ctx.tenancy}`/`${ctx.guardrails}`. Absent that, elicit them from
the user. Never assume a single implicit jurisdiction.

## When to Activate

Activate when:
- Asked to draft, bootstrap, or refactor an ontology / TBox for a specific use case.
- Designing an information-extraction schema or a structured-data mapping model.
- Establishing CQ-to-model traceability, temporal/provenance/authority modelling, or SHACL shapes.

**Do not activate** (adjacent skills own this):
- `ontology-guided-retrieval` — owns querying an already-built graph at runtime.
- `grounded-answer-with-citations` — owns synthesising answers from retrieved context.
- `memory-systems` — owns runtime agent memory stores, not domain ontology design.

## Enterprise-grade posture

This skill produces ontologies that must hold up in production, audit, and regulated settings. Minimalism is still the rule — but "minimal" means *no element that is not justified*, not *ignore concerns the use case actually requires*. For enterprise and regulated products the following are first-class concerns, and each must be **explicitly included or explicitly excluded with a reason** (never silently dropped):

- **identity & stable IRIs** — every entity is durably addressable
- **temporal validity & point-in-time** — facts and source versions are valid *as at* a date; nothing is assumed current forever
- **provenance & authority** — where a fact came from, who asserted it, and how authoritative that source is
- **confidence / trust** — how certain an assertion is, when answers must be defensible
- **jurisdiction & applicability context** — where and for whom a fact holds
- **data classification & tenancy** — sensitivity, PII, and per-tenant isolation
- **governance & lifecycle** — the ontology itself is versioned, deprecable, and modular

These are handled by the cross-cutting **enterprise dimensions** (step 5) and **governance metadata** (step 10). Read `references/enterprise-dimensions.md` before modeling, and reuse the standard vocabularies in `references/vocabulary-registry.md` rather than inventing equivalents.

## Required behavior

Follow this workflow in order.

### 1. Normalize the inputs

Extract and organize whatever is available into these buckets. 

- purpose: intended users or consumers, use cases, scope boundaries, competency questions, assumptions, constraints, and any temporal, jurisdictional, authority, or trust requirements implied by those use cases
- representative data, structured or unstructrued. Typically structured data will be presented in the form of csv files or json/xml/yaml. Unstructured data will be presented as doucments in natural language. They can be of any nature (manuals, reports, contracts, etc.) 
- existing ontologies, vocabularies, or ontology design patterns that can be reused fully or partially to avoid reinventing the wheel. 
- supporting semantic evidence such as glossary terms, documentation, data catalog descriptions or SME notes
- implementation and validation constraints such as formalism, naming rules, reasoning profile, test expectations, and quality criteria
- governance and lifecycle inputs such as required IRI/namespace policy, versioning expectations, deprecation rules, tenancy and data-classification requirements, and the authoritative sources whose provenance must be tracked

When a bucket is missing or thin, say so explicitly and describe how the gap affects the ontology design before proceeding with the available inputs and get confirmation from the user.
Do not invent requirements to fill gaps.

### 2. Build the requirement gate

Create a candidate list of classes, properties, and controlled values from:

- explicit use cases
- explicit scope statements
- competency questions
- implementation constraints that force representational choices

Treat competency questions as the strongest filter.
An ontology element is eligible only if it is required to answer at least one competency question or explicit requirement.

### 3. Build the evidence gate

Check each candidate against the representative data.
Support can be direct or near-direct evidence from the samples, such as:

- repeated entities or record types
- repeated attributes or columns
- events, roles, states, measures, identifiers, dates, places, relationships, document structures, or lexical patterns
- examples in documents that an extraction model or mapping would need to capture

Generalize beyond literal sample mentions when doing so creates a reusable class or property, but only when the generalization is still supported by the data.
Assume the provided sample is incomplete. For unstructured sources, expect similar documents; for structured sources, expect additional records.

### 4. Apply strict inclusion and exclusion rules

Include an ontology element only when both conditions hold:

1. it is required by at least one explicit requirement or competency question
2. it is supported by the sample data

Exclude everything else, even if it appears in a reused vocabulary, in domain background material, or seems generally useful.
Do not expand the model for elegance, completeness, future possibilities, or encyclopedic coverage.

### 5. Apply the cross-cutting enterprise dimensions

Before choosing the taxonomy, run the candidate model through the cross-cutting dimensions in `references/enterprise-dimensions.md`. For each dimension record one of:

- **include** — a requirement or competency question needs it → add the pattern (reusing the standard vocabulary) to the model
- **exclude** — not required → state that in one line so the omission is deliberate and defensible

The dimensions to consider every time:

1. **Identity & stable IRIs** — durable, opaque IRIs under a governed namespace.
2. **Temporal validity & point-in-time** — model changeable facts as time-indexed; separate *valid time* (true in the world) from *transaction time* (recorded by the system) when "as recorded on" auditing is needed (bitemporal).
3. **Versioning of described resources** — when the things you describe are published in versions (legislation, standards, documents, policies), use a work/expression pattern (FRBR/ELI) so a query can pin to a point-in-time version.
4. **Provenance** — every asserted fact can carry where it came from and who asserted it (PROV-O).
5. **Authority & precedence** — when sources conflict, rank them using `${ctx.authority_hierarchy}` (e.g. for social housing: statute > statutory instrument > regulator standard > guidance > Ombudsman determination > best practice) as a controlled value on the source or assertion.
6. **Confidence / trust** — when answers must be defensible, allow a certainty value on assertions (distinct from authority).
7. **Jurisdiction & applicability context** — tag facts with the jurisdiction/context in which they hold; never assume a single implicit jurisdiction.
8. **Data classification & tenancy** — mark sensitivity/PII and, for multi-tenant products, the tenant scope, so isolation and redaction are enforceable at the data layer.

Apply the same discipline as the requirement and evidence gates: include a dimension only when a requirement or competency question needs it — but for enterprise products these are usually needed, so justify exclusions carefully.

### 6. Choose a top-level grounding scheme

Create a small set of top-level mutually disjoint grounding classes that reduces cross-category confusion.
Choose and adapt a domain-appropriate pattern such as (take them as guidance, not as enforced templates):

- person, object, location, event
- temporal_entity, spacetime_volume, dimension, place, persistent_item, time_span
- asset_artifact, data_information, governance, location, measurement, party, process_event, state_condition, time
- another similarly practical top-level scheme

Rules:

- keep the set small and useful
- declare the top-level classes mutually disjoint
- place each included class under exactly one grounding branch unless a different design is explicitly required
- explain why this grounding scheme fits the use case

### 7. Keep the taxonomy shallow and extraction-friendly

Apply these modeling constraints:

- maximum class depth is 3
- prefer properties over deeper subclass trees
- add a third level only when clearly necessary for the competency questions or mapping/extraction task
- use potential subclasses beyond level 3 to create few shot examples added to a (multivalued) property associated to the class. Use rdfs:comment or   skos:example prefixing the value with "examle: " to make it clear that the value is an example and not a controlled value.
- keep names concrete and operational
- make the ontology reusable, but concrete enough for information extraction from unstructured text or mapping from structured data

### 8. Reuse external vocabularies carefully

Prefer established, well-governed vocabularies over bespoke terms for the cross-cutting dimensions and other solved problems. Consult `references/vocabulary-registry.md` and reuse by default for: labelling and controlled values (SKOS), descriptive metadata (Dublin Core Terms), provenance (PROV-O), time and intervals (OWL-Time), published-work versioning (FRBR/FaBiO, ELI for legislation), datasets/catalogues (DCAT), organisations and people (ORG, FOAF), and units/quantities (QUDT).

Rules:

- reuse a term only when it helps satisfy an included requirement — reuse does not bypass the inclusion gates
- reuse *terms*, not whole ontologies: import or re-declare only the specific classes/properties you use, never large fragments that violate minimal scope
- keep reused terms in their original namespace (do not clone them under your namespace); bind a clear prefix
- map reused terms into the final ontology narrative so the output remains understandable on its own
- when reuse is partial, say what was reused and what was deliberately not reused
- if no suitable standard term exists, mint your own under the governed namespace and note why reuse was not possible

### 9. Define classes and properties clearly

Provide an Aristotelian definition for every class whenever possible, in the form:

- “an x is a y that z.”

Also define properties and other modeled elements with informative, disambiguating descriptions.
Avoid circular definitions and vague labels.
Definitions must help distinguish nearby concepts that might be confused during extraction or mapping.

### 10. Add governance, identity, and lifecycle metadata

Make the ontology itself an enterprise artifact. Follow `references/validation-and-governance.md` and record:

- **namespace & IRI policy** — a single base IRI, a versioned ontology IRI, and stable, opaque local identifiers for entities
- **ontology version metadata** — `owl:versionInfo`, `owl:versionIRI`, `owl:priorVersion`, `dcterms:created`/`dcterms:modified`, and a human-readable change note
- **deprecation policy** — mark removed terms `owl:deprecated true` with `dcterms:isReplacedBy` rather than deleting them, so downstream mappings do not silently break
- **modularity** — if the model spans separable concerns (e.g. a domain module and a provenance/authority/temporal module), keep them as separate importing modules so they evolve independently
- **reasoning profile** — state the intended profile (OWL RL / EL / QL or plain RDFS) and keep axioms within it
- **licensing & ownership** — note the ontology's licence and maintaining party when relevant

Keep this metadata proportionate: a handful of stable annotations, not a governance bureaucracy.

### 11. Validate before producing the final ontology

Run the checks in `references/modeling-checklist.md` (now including the enterprise-dimension and governance checks) before finalizing the ontology.

For enterprise/regulated products also:

- **author SHACL shapes** for the constraints that matter (required properties, cardinalities, controlled-value membership, jurisdiction/temporal presence). See `references/validation-and-governance.md`. These shapes become the data-layer contract and are part of the deliverable.
- **write one test query per competency question** (SPARQL, or the target query language) and confirm the model can answer each. A competency question the model cannot answer is a modeling defect.
- keep reasoning within the declared profile.

If the model fails any check, fix the problem and re-run before proceeding.

## Output contract

Return the result in the following sections and follow the structure defined in `references/output-template.md`.

### 1. CQ-to-ontology mapping

For each competency question, provide:

- the cq text or a concise identifier
- the ontology classes, properties, and controlled values needed to answer it
- a short note on why each element is required
- any important exclusions or unresolved gaps

If there are explicit requirements that are not phrased as competency questions, include them in the same section under a clearly labeled requirements subsection.

### 2. Cross-cutting dimensions decision record

For each enterprise dimension, record the decision so every omission is deliberate:

- the dimension (identity, temporal validity, resource versioning, provenance, authority/precedence, confidence, jurisdiction, classification/tenancy)
- the decision: include or exclude
- the driver: the CQ or requirement forcing it (for includes) or the reason it is not needed (for excludes)
- the pattern and reused vocabulary used (for includes)

### 3. Top-level disjoint class scheme

Provide:

- the chosen grounding classes
- a one-line rationale for the scheme
- the mutual disjointness statement
- a short mapping from each included class to one grounding class

### 4. Class definitions

For every included class, provide:

- preferred label
- parent class
- definition
- inclusion justification: cite the requirement or cq and the supporting sample-data signal
- key properties that are necessary for the use case

You may also define essential properties in this section when that improves clarity.

### 5. Final ontology serialization

Serialise only the final included ontology.
Follow RDFS and minimally OWL to differentiate relationships from attributes (owl:ObjectProperty vs owl:DatatypeProperty respectively) and for any additional construct when strictly needed.
Serialise in turtle syntax.

When serializing:

- open with the **governance header** (ontology IRI, `owl:versionIRI`, `owl:versionInfo`, `owl:priorVersion`, `dcterms:created`/`dcterms:modified`, licence) from step 10
- include prefixes, binding one for every reused vocabulary (skos, dcterms, prov, time, eli, org, qudt, …)
- declare classes and required properties only
- assert top-level disjointness
- include the enterprise-dimension patterns marked *include* in section 2 (temporal validity, provenance, authority ranking, jurisdiction, classification), reusing standard vocabularies
- keep axioms minimal and practical
- add domains and ranges as much as possible but make sure they are stable enough to help the use case
- avoid speculative restrictions and avoid ornamental axioms

After the ontology (T-Box), provide the **SHACL shapes** (Turtle) that enforce the required constraints and controlled values. Keep the two concerns visually separated: the ontology first, then the shapes.

### 6. Translate the ontology into actionable artifacts
 
#### If the sample data contains unstructured documents:
Generate a `GraphSchema` JSON file that can be used to extract the modeled concepts and relationships using a large language model: 
After writing the ontology `.ttl` file, run the bundled conversion script
`scripts/owl_to_graphrag_schema.py` (located in the same directory as this
skill) passing the `.ttl` path as the positional argument. The script writes
a `GraphSchema` JSON file alongside the ontology using the same stem and
`.json` extension. Pass `--out <path>` to override the output location.

Dependencies: `rdflib`, `neo4j-graphrag`.

Confirm the JSON was written and report the node type count, relationship type
count, and pattern count to the user.
#### If the sample data contains structured documents:
Generate a mapping specification that can be used to map the structured data to the ontology. The mapping specification should include:
- a mapping from each column or field in the structured data to the corresponding class or property in the ontology
- any necessary transformations or normalization rules for the data
- examples of how to apply the mapping to the structured data

## Style and decision rules

- be explicit about what was excluded and why, but keep exclusions concise
- never let sample-data details force an overly narrow ontology boundary
- never let domain background knowledge broaden the ontology beyond the stated purpose
- prefer a model that is defensible and traceable over one that is comprehensive
- when the evidence is ambiguous, choose the smaller ontology and explain the tradeoff

## Gotchas

1. **Sample data as the boundary**: modelling only what appears in the sample yields a brittle,
   over-narrow ontology. Generalise where the data supports a reusable class, but keep the
   requirement gate.
2. **Elegance creep**: adding classes for completeness/future-proofing violates the inclusion
   gates. Every element must trace to a CQ or explicit requirement *and* have data support.
3. **Reusing whole ontologies**: importing large external fragments breaks minimal scope — reuse
   individual terms in their own namespace, not entire vocabularies.
4. **Silent enterprise omissions**: dropping temporal validity, provenance, jurisdiction, or
   tenancy without a stated reason is a defect in regulated settings — record include/exclude for
   each dimension.
5. **Implicit "current"/single jurisdiction**: assuming facts are always current or apply
   everywhere corrupts point-in-time and cross-jurisdiction answers. Model valid-time and
   jurisdiction explicitly.
6. **Unanswerable competency question**: if a CQ has no query path in the model, that's a modeling
   defect — fix before finalising (write one test query per CQ).

## Integration

- `ontology-guided-retrieval` — consumes the ontology (classes, relations, authority) at runtime.
- `grounded-answer-with-citations` — relies on the authority/temporal/provenance model defined here.
- `memory-systems` — when the built graph also serves as long-term knowledge memory.

## References

- `references/enterprise-dimensions.md`, `references/vocabulary-registry.md`,
  `references/validation-and-governance.md`, `references/modeling-checklist.md`,
  `references/output-template.md` — load at the step that names them.
- `scripts/owl_to_graphrag_schema.py` — run to emit a GraphSchema JSON from the `.ttl`.
- Best practices: https://agentskills.io/skill-creation/best-practices
