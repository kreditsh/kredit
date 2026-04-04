# kredit

Financial risk management SDK for AI agents.

## Install

```bash
# Python
pip install kredit

# TypeScript
npm install kredit

# CLI
curl -fsSL https://kredit.sh/install.sh | bash
```

## Quick start

```python
from kredit import Kredit

kredit = Kredit(api_key="kr_live_...")
result = kredit.check(agent_id="agt_...", action="serp_api.search", estimated_cost=1)
```
