# Reusable vocabulary registry

> **Load when: choosing which standard vocabulary to reuse for a term (step 8).**

Reuse an established vocabulary before minting your own term for a solved problem — especially for the cross-cutting dimensions. Reuse **terms**, not whole ontologies: re-declare or import only the specific classes/properties you use, keep them in their original namespace, and bind a clear prefix. If nothing fits, mint under your governed namespace and note why.

| Prefix | Namespace IRI | Use it for | Do NOT use it for |
|---|---|---|---|
| `rdfs` | `http://www.w3.org/2000/01/rdf-schema#` | class/property declaration, `subClassOf`, `label`, `comment`, `domain`/`range` | rich constraints (use OWL/SHACL) |
| `owl` | `http://www.w3.org/2002/07/owl#` | object vs datatype properties, disjointness, versioning, deprecation | data-quality constraints (use SHACL) |
| `skos` | `http://www.w3.org/2004/02/skos/core#` | controlled vocabularies, code lists, labels (`prefLabel`/`altLabel`), authority & jurisdiction schemes, `example` | class taxonomy of the domain (use rdfs/owl) |
| `dcterms` | `http://purl.org/dc/terms/` | descriptive metadata: `title`, `identifier`, `source`, `created`, `modified`, `issued`, `valid`, `hasVersion`, `isReplacedBy`, `spatial`, `license` | domain relationships |
| `prov` | `http://www.w3.org/ns/prov#` | provenance: `wasDerivedFrom`, `wasAttributedTo`, `wasGeneratedBy`, `Agent`, `Activity`, `Entity` | authority ranking (model that as a controlled value) |
| `time` | `http://www.w3.org/2006/time#` | temporal validity, intervals, instants, `hasBeginning`/`hasEnd` | plain single dates (use `xsd:date`) |
| `eli` | `http://data.europa.eu/eli/ontology#` | legislation as work/expression, point-in-time legal versions, `LegalResource`/`LegalExpression` | non-legal documents (use FaBiO/FRBR) |
| `fabio` | `http://purl.org/spar/fabio/` | documents, reports, articles and their versions (FRBR-based) | legislation (prefer ELI) |
| `dcat` | `http://www.w3.org/ns/dcat#` | datasets, distributions, data catalogues | individual records |
| `org` | `http://www.w3.org/ns/org#` | organisations, roles, memberships, org units | natural persons only (use FOAF) |
| `foaf` | `http://xmlns.com/foaf/0.1/` | people, agents, basic contact | organisational structure (use ORG) |
| `qudt`/`unit` | `http://qudt.org/schema/qudt/` | quantities, units, measurements | plain counts without units |
| `geo` | `http://www.opengis.net/ont/geosparql#` | geospatial geometries and topology | simple place names (use `dcterms:spatial` + SKOS) |
| `sh` | `http://www.w3.org/ns/shacl#` | validation shapes, cardinality, controlled-value membership | inference (use OWL/RDFS) |
| `schema` | `https://schema.org/` | lightweight, web-oriented common types when partners expect it | rigorous domain modelling |

## Reuse rules

- Reuse only when it satisfies an **included** requirement — reuse does not bypass the inclusion gates.
- Do not clone external IRIs under your namespace; reference them directly.
- Prefer SKOS `Concept` schemes for every code list (authority levels, jurisdictions, statuses, classifications) so values are governed, labelled, and extensible without touching the class taxonomy.
- Keep provenance/authority/temporal terms in a separate module namespace if the model is large, so the domain module stays clean.
