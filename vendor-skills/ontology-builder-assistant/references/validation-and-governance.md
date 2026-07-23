# Validation & governance

> **Load when: adding governance/versioning metadata (step 10) or authoring SHACL shapes (step 11).**

Turns the ontology into a maintainable, verifiable enterprise artifact. Two parts: **conformance** (SHACL + CQ test queries) and **governance** (versioning, deprecation, modularity, reasoning profile).

Prefixes:

```turtle
@prefix owl:     <http://www.w3.org/2002/07/owl#> .
@prefix rdfs:    <http://www.w3.org/2000/01/rdf-schema#> .
@prefix xsd:     <http://www.w3.org/2001/XMLSchema#> .
@prefix sh:      <http://www.w3.org/ns/shacl#> .
@prefix skos:    <http://www.w3.org/2004/02/skos/core#> .
@prefix dcterms: <http://purl.org/dc/terms/> .
@prefix ex:      <https://example.org/ont/> .
```

---

## 1. SHACL shapes (the data-layer contract)

OWL is open-world and infers; it does **not** validate. Use SHACL to enforce what must be true of the data: required properties, cardinalities, datatypes, and controlled-value membership. Ship the shapes alongside the ontology.

```turtle
ex:LegalStatusAssertionShape a sh:NodeShape ;
    sh:targetClass ex:LegalStatusAssertion ;
    sh:property [ sh:path ex:aboutProvision ; sh:minCount 1 ; sh:maxCount 1 ; sh:nodeKind sh:IRI ] ;
    sh:property [ sh:path ex:statusValue ; sh:minCount 1 ; sh:in ( ex:InForce ex:Repealed ex:Amended ) ] ;
    sh:property [ sh:path ex:jurisdiction ; sh:minCount 1 ] ;                 # no untagged jurisdiction
    sh:property [ sh:path ex:validFrom ; sh:minCount 1 ; sh:datatype xsd:date ] ;
    sh:property [ sh:path ex:authorityLevel ; sh:minCount 1 ] ;              # every assertion is rankable
    sh:property [ sh:path ex:confidence ; sh:maxCount 1 ;
                  sh:datatype xsd:decimal ; sh:minInclusive 0 ; sh:maxInclusive 1 ] .
```

Author a shape for every class that carries an included enterprise dimension. At minimum enforce: identity present, controlled values constrained with `sh:in` or `sh:class`, temporal presence where required, provenance/authority present where required.

## 2. Competency-question test queries

Every CQ must have a query that the model can answer. A CQ with no answerable query is a modeling defect — fix the model, not the query. See Pattern G in `temporal-and-provenance-patterns.md` for the point-in-time example. Keep these queries with the deliverable as an executable acceptance suite.

## 3. Ontology governance header

```turtle
<https://example.org/ont/> a owl:Ontology ;
    owl:versionIRI <https://example.org/ont/1.2.0> ;
    owl:versionInfo "1.2.0" ;
    owl:priorVersion <https://example.org/ont/1.1.0> ;
    dcterms:created "2026-02-01"^^xsd:date ;
    dcterms:modified "2026-07-01"^^xsd:date ;
    dcterms:license <https://creativecommons.org/licenses/by/4.0/> ;
    rdfs:comment "Change note: added authority precedence scheme and jurisdiction tagging."@en .
```

**IRI policy**: one base IRI; opaque, stable local names; never encode mutable facts in IRIs; version the ontology IRI, not the entity IRIs.

## 4. Deprecation (never silently delete)

Downstream mappings break silently if terms vanish. Deprecate instead:

```turtle
ex:OldStatusFlag a owl:DatatypeProperty ;
    owl:deprecated true ;
    dcterms:isReplacedBy ex:statusValue ;
    rdfs:comment "Deprecated in 1.2.0; use ex:statusValue."@en .
```

## 5. Modularity

If the model spans clearly separable concerns, split into importing modules so each evolves independently:

```turtle
<https://example.org/ont/domain/> owl:imports <https://example.org/ont/provenance/> .
```

Typical split for regulated products: a **domain module** (the subject matter) + a **provenance/authority/temporal module** (the cross-cutting machinery, reusable across products).

## 6. Reasoning profile

State the intended profile and keep axioms inside it:

- **RDFS / OWL RL** — scalable rule-based inference over large graphs (usual choice for knowledge-graph + RAG products).
- **OWL EL** — large terminologies with subsumption (bio/med-style).
- **OWL QL** — query rewriting over relational/large data.
- Full **OWL DL** only when complex class expressions are genuinely required.

Avoid axioms your target store/reasoner will not use. For property-graph targets (e.g. Neo4j via `scripts/owl_to_graphrag_schema.py`), keep OWL light — it drives extraction/mapping, not DL reasoning.

## 7. Continuous validation (recommended)

- Run SHACL on ingested data in CI; fail the build on violations.
- Run the CQ query suite against a fixture graph.
- Lint the ontology (unused prefixes, dangling domains/ranges, undefined terms).
- On version bump, diff against `owl:priorVersion` and require a change note.
