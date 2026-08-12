# Review queue

A small dependency-free full-stack validation project. The browser requests review items from the
Python HTTP entry, the service asks the repository for rows, and SQLite defines their persistence.

Run the dependency-free service test from the repository root with:

```bash
PYTHONPATH=examples/fullstack python3 -m unittest discover -s examples/fullstack/tests
```
