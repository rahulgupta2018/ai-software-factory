# Temporal, provenance & authority patterns

> **Load when: modelling temporal validity, provenance, or authority patterns (dimensions 2–5).**

Concrete, copy-ready patterns for the highest-risk enterprise dimensions. All use these prefixes:

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
@prefix sh:      <http://www.w3.org/ns/shacl#> .
```

---

## Pattern A — Time-indexed fact (n-ary)

Do not attach a changeable fact as a plain binary property (`ex:provision ex:status ex:Repealed`). Reify it so it can carry validity, provenance, authority, jurisdiction, and confidence.

```turtle
ex:LegalStatusAssertion a owl:Class ;
    rdfs:comment "A time-indexed, sourced statement that a provision holds a legal status within a jurisdiction."@en .

ex:asrt-001 a ex:LegalStatusAssertion ;
    ex:aboutProvision ex:RentersRightsAct2025-s21 ;
    ex:statusValue    ex:Repealed ;          # controlled value
    ex:jurisdiction   ex:England ;
    ex:validFrom      "2026-05-01"^^xsd:date ;
    ex:validTo        "9999-12-31"^^xsd:date ;
    prov:wasDerivedFrom ex:RentersRightsAct2025-2026-05-01 ;
    ex:authorityLevel ex:PrimaryLegislation ;
    ex:confidence     "0.99"^^xsd:decimal .
```

## Pattern B — Bitemporal (valid time vs transaction time)

When you must answer "what did we *know* on date D", keep both axes. Never overwrite; append a new assertion and close the previous one's `recordedTo`.

```turtle
ex:asrt-001 ex:validFrom "2026-05-01"^^xsd:date ;   # true in the world from
             ex:recordedFrom "2026-05-02"^^xsd:date ; # system learned it on
             ex:recordedTo   "9999-12-31"^^xsd:date . # still current record
```

Query "as at world-date V, as known on system-date K": filter `validFrom <= V < validTo` **and** `recordedFrom <= K < recordedTo`.

## Pattern C — Work / expression versioning (ELI for legislation)

```turtle
ex:HousingAct2004 a eli:LegalResource ;
    dcterms:title "Housing Act 2004"@en ;
    dcterms:hasVersion ex:HousingAct2004-2025-04-01 .

ex:HousingAct2004-2025-04-01 a eli:LegalExpression ;
    dcterms:isVersionOf ex:HousingAct2004 ;
    eli:version_date "2025-04-01"^^xsd:date ;
    eli:in_force ex:InForce .
```

A citation always points at the **expression** (the dated version), never only the work.

## Pattern D — Provenance chain (PROV-O)

```turtle
ex:curation-42 a prov:Activity ;
    prov:wasAssociatedWith ex:LegalReviewTeam ;
    prov:used ex:AwaabsLawRegs2025-2025-10-27 ;
    prov:endedAtTime "2026-01-10T00:00:00Z"^^xsd:dateTime .

ex:Obligation-Damp-24h a ex:Obligation ;
    prov:wasGeneratedBy ex:curation-42 ;
    prov:wasDerivedFrom ex:AwaabsLawRegs2025-2025-10-27 ;
    prov:wasAttributedTo ex:LegalReviewTeam .
```

For triple-level provenance prefer **named graphs** (one graph per source/version) over reification; the graph IRI carries `dcterms:source`, `ex:authorityLevel`, `prov:wasDerivedFrom`.

## Pattern E — Authority precedence

Authority is a governed, ranked code list so conflicts resolve by `MIN(rank)`.

```turtle
ex:PrimaryLegislation ex:rank 1 .
ex:SecondaryLegislation ex:rank 2 .
ex:RegulatorGuidance ex:rank 3 .
ex:Determination ex:rank 4 .
ex:BestPractice ex:rank 5 .
```

Resolution query sketch (pseudo-SPARQL): among assertions valid at date D for the same subject+jurisdiction, select the one whose source has the lowest `ex:rank`; break ties by most recent `ex:validFrom`.

## Pattern F — Jurisdiction & applicability context

Model each applicability axis as its own SKOS scheme (jurisdiction, tenure, hazard class) and tag the assertion, not the abstract concept.

```turtle
ex:asrt-001 ex:jurisdiction ex:England ;
            ex:appliesToTenure ex:SocialRent .
```

## Pattern G — Point-in-time retrieval (SPARQL sketch)

```sparql
SELECT ?status WHERE {
  ?a a ex:LegalStatusAssertion ;
     ex:aboutProvision ex:RentersRightsAct2025-s21 ;
     ex:jurisdiction ex:England ;
     ex:statusValue ?status ;
     ex:validFrom ?from ; ex:validTo ?to .
  FILTER (?from <= "2026-06-01"^^xsd:date && "2026-06-01"^^xsd:date < ?to)
}
```

This is the query the temporal pattern exists to make answerable — write one like it per temporal competency question and confirm the model supports it.
