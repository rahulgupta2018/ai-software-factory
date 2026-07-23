# Output template

> **Load when: assembling the final deliverable sections (output contract).**

Use this structure in the final answer.

## 1. CQ-to-ontology mapping

For each competency question or explicit requirement, use a compact block like this:

- **CQ-1**: [question]
  - **Needed ontology elements**: ClassA, ClassB, propertyC, valueD
  - **Why needed**: [one short explanation]
  - **Exclusions / gaps**: [optional]

## 2. Cross-cutting dimensions decision record

One row per enterprise dimension. Record the decision so every omission is deliberate.

| Dimension | Decision (include/exclude) | Driver (CQ/requirement, or why not needed) | Pattern & reused vocabulary |
|---|---|---|---|
| Identity & stable IRIs | | | |
| Temporal validity / point-in-time | | | |
| Resource versioning (work/expression) | | | |
| Provenance | | | |
| Authority & precedence | | | |
| Confidence / trust | | | |
| Jurisdiction & applicability | | | |
| Classification & tenancy | | | |

## 3. Top-level disjoint class scheme

- **Scheme chosen**: [list top-level classes]
- **Why this scheme fits**: [1-3 sentences]
- **Disjointness**: `DisjointClasses(...)` or the equivalent in the requested formalism
- **Branch assignment**:
  - ClassA -> TopLevel1
  - ClassB -> TopLevel2

## 4. Class definitions

Use one subsection per class.

### ClassName
- **Parent**: ParentClass
- **Definition**: An ClassName is a ParentClass that ...
- **Inclusion justification**: required by [CQ/requirement], supported by [sample-data signal]
- **Necessary properties**:
  - `propertyName`: [clear description]
- **Enterprise annotations** (when applicable): identity scheme, temporal/jurisdiction tagging, provenance/authority carried, classification/tenancy

## 5. Final ontology serialization

Default to Turtle unless the user explicitly requests a different syntax. Order the serialization as:

1. **Governance header** — ontology IRI, `owl:versionIRI`, `owl:versionInfo`, `dcterms:created`/`dcterms:modified`, `owl:priorVersion`, licence.
2. **Prefixes** — including every reused vocabulary (skos, dcterms, prov, time, eli, org, qudt, …).
3. **Ontology (T-Box)** — classes, properties, top-level disjointness, and the enterprise-dimension patterns marked *include* in section 2.
4. **SHACL shapes** — the constraints and controlled values that enforce the model at the data layer.

Keep the T-Box and the SHACL shapes visually separated.

## 6. Actionable artifacts

- Unstructured data → `GraphSchema` JSON via `scripts/owl_to_graphrag_schema.py`.
- Structured data → a field-to-ontology mapping specification.
