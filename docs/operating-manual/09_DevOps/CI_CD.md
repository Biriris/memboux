# CI/CD

Automate linting, testing, builds and deployments before merging to main.

## Quality gate

The `Quality checks` workflow runs for every push to `main` and for every pull
request. It installs the locked dependency tree, validates all D1 migrations,
runs the complete release gate (`build`, TypeScript checks, tests and bundle
budgets), and verifies that generated assets are current.

Worker integration tests retain Vitest file isolation and run with at most four
workers. The explicit limit avoids exhausting the CPU and memory available on
hosted CI runners while retaining parallel execution.

## Production smoke

The independent `Production smoke` workflow checks the deployed application on
its schedule and when manually dispatched. A failure in `Quality checks` is not
itself a production smoke failure; inspect the failing workflow and step before
classifying the incident.
