# Kredit

Risk management SDK for AI agents. Wallets, credit scoring, and spend authorization.

## Install

```bash
pip install kredit
```

## Quick Start

```python
from kredit import Kredit

kredit = Kredit(api_key="kr_live_...")

# Risk check before an API call
result = kredit.check(agent_id="bot-01", action="serp_api.search", estimated_cost=1)

if result.allow:
    # do the API call...
    kredit.report(agent_id="bot-01", txn_id=result.transaction_id, outcome="success", actual_cost=1)
```

## Docs

https://kredit.sh/docs
