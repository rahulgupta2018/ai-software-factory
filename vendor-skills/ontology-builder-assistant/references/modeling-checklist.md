# Modeling checklist

> **Load when: validating the model before finalising (step 11).**

Use this checklist before finalizing the ontology.

## Inclusion test

Every included element must pass both tests:

1. requirement test: needed by an explicit requirement or competency question. If not, exclude the element and mention the exclusion briefly.
2. evidence test: supported by representative data. If the the element is required by 1 but no supported data is found in the samples, mention it briefly.


## Depth test

- maximum taxonomy depth: 3
- prefer properties over subclasses
- add a third level only when a competency question or mapping task requires it

## Grounding test

- choose a small top-level grounding scheme
- keep top-level classes mutually disjoint
- assign each included class to one grounding branch

## Serialization test

- include only final included classes and properties
- assert top-level disjointness
- avoid speculative axioms
- add domain/range only when stable and useful

## Definition test

- every class gets an informative definition
- use Aristotelian form when possible
- avoid circular or generic wording

## Enterprise-dimension test

For each cross-cutting dimension, confirm an explicit include/exclude decision is recorded (see `enterprise-dimensions.md`). No dimension may be silently dropped; excludes need a one-line reason.

- identity & stable IRIs
- temporal validity / point-in-time
- resource versioning (work/expression)
- provenance
- authority & precedence
- confidence / trust
- jurisdiction & applicability
- data classification & tenancy

## Reuse test

- cross-cutting concerns reuse a standard vocabulary (see `vocabulary-registry.md`) unless none fits
- reused terms keep their original namespace and a bound prefix
- no large ontology fragments imported beyond the terms actually used

## Governance test

- single base IRI and versioned ontology IRI declared
- `owl:versionInfo` and created/modified metadata present
- removed terms are `owl:deprecated` with `dcterms:isReplacedBy`, not deleted
- intended reasoning profile stated and axioms stay within it

## Conformance test

- SHACL shapes exist for required properties, cardinalities, and controlled values
- one test query exists per competency question and the model answers it
