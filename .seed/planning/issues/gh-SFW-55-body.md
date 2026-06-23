## Problem
Tests and Subscriptions accordions do not show positive/negative fixture category; negative pass should use `module_execution.verdict`.

## Outcome
- Accordion header icons (positive/negative)
- Negative pass: `FINISHED` + `module_execution.verdict === 'clean_miss'`

## Spec
R2-04-04, R2-04-08

## Depends
spiderfeet SF-671
