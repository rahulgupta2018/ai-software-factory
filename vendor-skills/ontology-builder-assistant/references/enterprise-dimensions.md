# Cross-cutting enterprise dimensions

> **Load when: before modelling, to make the include/exclude decision for each cross-cutting dimension (step 5).**

These are the concerns that make an ontology hold up in production, audit, and regulated settings. For every ontology, make an **explicit include/exclude decision per dimension** and record it in the *Cross-cutting dimensions decision record* (output section 2). Never drop a dimension silently.

Minimalism still applies: include a dimension only when a requirement or competency question needs it. For enterprise/regulated products most of these are needed, so justify *exclusions* carefully.

Prefixes used in the snippets:

```turtle
@prefix ex:      <https://example.org/ont/> .
@prefix owl:     <http://www.w3.org/2002/07/owl#> .
@prefix rdfs:    <http://www.w3.org/2000/01/rdf-schema#> .
@prefix xsd:     <http://www.w3.org/2001/XMLSchema#> .
@prefix skos:    <http://www.w3.org/2004/02/skos/core#> .
@prefix dcterms: <http://purl.org/dc/terms/> .
@prefix prov:    <http://www.w3.org/ns/prov#> .
@prefix time:    <http://www.w3.org/2006/time#> .
@prefix eli:     <http://data.europa.eu/eli/ontology#> .
```

---

## 1. Identity & stable IRIs

- **When required**: always for enterprise products. Anything that is referenced, cited, versioned, or de-duplicated needs a durable identifier.
- **Pattern**: mint opaque, stable local names under one governed base IRI. Do not encode mutable facts (status, date, jurisdiction) into the IRI — put them in properties. Keep human labels in `skos:prefLabel`/`rdfs:label`, alternates in `skos:altLabel`.
- **Exclude when**: a throwaway extraction schema that never persists identifiers.

```turtle
ex:Determination-2024-0001 a ex:OmbudsmanDetermination ;
    skos:prefLabel "Determination 2024/0001"@en ;
    dcterms:identifier "2024/0001" .
```

## 2. Temporal validity & point-in-time

- **When required**: whenever a fact can change over time and a query may ask "what held **as at** date D" — legislation in force, policy versions, obligations, statuses.
- **Pattern**: do **not** attach a mutable fact directly as a binary property. Reify it as a time-indexed assertion (n-ary pattern) carrying a validity interval. Separate **valid time** (true in the world) from **transaction time** (recorded by the system) when audit ("as recorded on") matters — that is *bitemporal*.
- **Reuse**: OWL-Time (`time:hasBeginning`, `time:hasEnd`, `time:Interval`), `dcterms:valid`.
- **Exclude when**: the domain is genuinely static, or "latest only" is acceptable and provable.

```turtle
ex:InForce-RRA2025-s21 a ex:LegalStatusAssertion ;
    ex:aboutProvision ex:RentersRightsAct2025-s21 ;
    ex:statusValue ex:Repealed ;
    ex:validFrom "2026-05-01"^^xsd:date ;      # valid time
    ex:recordedAt "2026-06-15"^^xsd:date .     # transaction time (bitemporal)
```

## 3. Versioning of described resources (work / expression)

- **When required**: when the things you describe are themselves published in versions — legislation, standards (BS/EN), guidance, organisational policies. A citation must be pinnable to a specific point-in-time version.
- **Pattern**: split the abstract **work** from its dated **version/expression**; link versions with `dcterms:hasVersion` / `dcterms:isVersionOf` and order with `dcterms:issued`. For legislation prefer **ELI** (`eli:LegalResource` work → `eli:LegalExpression` version); for documents, FaBiO/FRBR.
- **Exclude when**: described resources have no meaningful versions.

```turtle
ex:HousingAct2004 a eli:LegalResource ;
    dcterms:hasVersion ex:HousingAct2004-2025-04-01 .
ex:HousingAct2004-2025-04-01 a eli:LegalExpression ;
    dcterms:isVersionOf ex:HousingAct2004 ;
    dcterms:issued "2025-04-01"^^xsd:date ;
    eli:version_date "2025-04-01"^^xsd:date .
```

## 4. Provenance

- **When required**: whenever an assertion must be traceable to a source (defensibility, citation, audit).
- **Pattern**: reuse **PROV-O**. A derived fact `prov:wasDerivedFrom` a source; `prov:wasAttributedTo` an agent; a curation activity `prov:wasGeneratedBy`. When you must annotate individual triples, use a named graph per source (quad store) or `rdf:Statement` reification — prefer named graphs.
- **Exclude when**: single-source data with no citation or audit requirement.

```turtle
ex:Obligation-Damp-24h a ex:Obligation ;
    prov:wasDerivedFrom ex:AwaabsLawRegs2025 ;
    prov:wasAttributedTo ex:LegalReviewTeam ;
    dcterms:source ex:AwaabsLawRegs2025 .
```

## 5. Authority & precedence

- **When required**: whenever sources can conflict and the system must decide which wins (e.g. statute > statutory instrument > regulator guidance > ombudsman determination > best practice).
- **Pattern**: model authority as a **controlled value** attached to the source (or to the assertion), plus an explicit rank so ordering is queryable. Use a `skos:ConceptScheme` of authority levels with an integer rank property.
- **Exclude when**: sources never conflict or all carry equal weight.

```turtle
ex:AuthorityLevel a skos:ConceptScheme .
ex:PrimaryLegislation  a skos:Concept ; skos:inScheme ex:AuthorityLevel ; ex:rank 1 .
ex:SecondaryLegislation a skos:Concept ; skos:inScheme ex:AuthorityLevel ; ex:rank 2 .
ex:RegulatorGuidance   a skos:Concept ; skos:inScheme ex:AuthorityLevel ; ex:rank 3 .
ex:Determination       a skos:Concept ; skos:inScheme ex:AuthorityLevel ; ex:rank 4 .
ex:BestPractice        a skos:Concept ; skos:inScheme ex:AuthorityLevel ; ex:rank 5 .

ex:AwaabsLawRegs2025 ex:authorityLevel ex:SecondaryLegislation .
```

## 6. Confidence / trust

- **When required**: when answers must be defensible and the system surfaces certainty (e.g. grounded-answer confidence signalling).
- **Pattern**: attach a normalized confidence value (0–1) and optionally a method/basis to the reified assertion. Keep it distinct from authority (authority = source weight; confidence = certainty of this assertion).
- **Exclude when**: all facts are treated as certain.

```turtle
ex:Obligation-Damp-24h ex:confidence "0.98"^^xsd:decimal ;
    ex:confidenceBasis "legal-partner-reviewed"@en .
```

## 7. Jurisdiction & applicability context

- **When required**: whenever the same concept can hold differently by place, tenure, organisation type, or building type — e.g. the four UK nations.
- **Pattern**: never assume one implicit jurisdiction. Tag facts (usually the reified assertion) with a jurisdiction controlled value; reuse `dcterms:spatial` or a jurisdiction scheme. Model other applicability contexts (tenure, hazard class) as their own controlled dimensions.
- **Exclude when**: single, fixed jurisdiction and context, stated explicitly.

```turtle
ex:Jurisdiction a skos:ConceptScheme .
ex:England a skos:Concept ; skos:inScheme ex:Jurisdiction .
ex:Scotland a skos:Concept ; skos:inScheme ex:Jurisdiction .

ex:InForce-RRA2025-s21 ex:jurisdiction ex:England .
```

## 8. Data classification, PII & tenancy

- **When required**: multi-tenant products, or any data with sensitivity/PII handling (e.g. per-organisation policy corpora; PII stripping).
- **Pattern**: tag entities/graphs with a classification controlled value and, for multi-tenant systems, a tenant scope so isolation and redaction are enforceable at the data layer (ideally one named graph per tenant). Flag PII-bearing classes explicitly.
- **Exclude when**: single-tenant, fully public data.

```turtle
ex:OrgPolicy-123 a ex:Policy ;
    ex:tenant ex:Customer-Acme ;
    ex:classification ex:Confidential .
```

---

## How to apply

For each dimension: decide **include** or **exclude**, name the driving CQ/requirement (or the reason it is not needed), and — for includes — the pattern and reused vocabulary. Put includes into the serialization (T-Box) and enforce them with SHACL (see `validation-and-governance.md`). Record every decision in output section 2.
