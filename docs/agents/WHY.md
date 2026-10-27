# Why the agents exist, and why we show them

Read this before touching the agents or the garage visual. If a piece of work doesn't serve this
page, it's off track.

## 1. What Launch Control is

A business development systems firm (Max's framing, 2026-10-02 / 10-08). We build the commercial
engine behind a business (brand, site, CRM, lead generation, outreach), **then we help run it.**
Formula: find the market → find the people → build the system → contact them → track them →
follow up → create opportunities. Hyper Racer USA is the prototype. Every client gets their own
copy of the master CRM.

The money is in the second half: the retainer tiers. A retainer client pays every month for
"we help run it."

## 2. What the agents are

The agents **are** "we help run it." Each one is a crew member doing a recurring job on the
engine, so two people can run it for many clients:

| Agent | Its job, in the client's words | What the client gets |
|---|---|---|
| Prospector | Finds who's worth contacting | A steady supply of qualified businesses, each with the reason it fits |
| Outreach Writer | Writes the first email and follow-ups | Specific, short emails built on a real fact about each prospect. Drafts only |
| Guardian | Checks everything before it leaves | Their domain and reputation stay protected: caps, bounces, opt-outs |
| Strategist | Learns what's working | Proposals on where to aim next, backed by their own numbers |
| Mission Control | Runs the crew, writes the brief | One summary: what happened, the one decision that needs a human |

Hard rules: agents never contact each other directly, each job has one owner, and **anything that can't
be undone (a send, a weight change) waits for a person.** Every decision is a row in `agent_runs`.

## 3. Why we show them (the garage)

Agents are invisible. A client paying a retainer sees nothing happen between calls, and you
can't keep paying for something you can't see. The garage shows the work: the
crew is the agents, the car is a deal, race control is the safety check, the board is their results.

It has to answer four questions, in this order:
1. **What am I looking at?** (legend: car = your deal, crew = agents, race control = checks + you)
2. **Who is doing what?** (one card per agent, one sentence each)
3. **What did it produce for me?** (the board: scanned → good fit → drafted → sent → replies → won)
4. **Where am I in control?** (nothing leaves without approval)

Who watches it: Max's prospects in a pitch (proof the engine runs), and retainer clients as their
own recap (proof it's running for them).

## 4. Rules

- The 3D scene is the backdrop and gets rendered once. What changes per client and per week is the **data
  layer** (`story_v2.py` style overlay or a live web board), never a re-render.
- Every number is a real row, or it's labelled as an example. No invented numbers.
- A client's numbers are shown only to that client. Never to other clients, never on the public site.
- No time or speed claims anywhere: no hours, "faster", "overnight".
- The visual serves the message. Rendering polish is not the job.

## 5. Where it actually stands (2026-10-27)

The garage depicts the designed system. Only part of it runs today:

- **Real:** lead-gen runs (2 runs: 299 found, 129 kept), scoring with reasons, 34 drafts, 56 emails sent
  to 34 leads. The CRM, sending and inbox sync.
- **Zero so far:** prospect replies. The 3 inbound messages and the 1 "converted" lead are our own
  E2E test lead plus one unlinked message. Never count them as results.
- **Defined but not running:** all five agents are prompt files in `.claude/agents/`. Nothing
  schedules them, so they run only when someone opens a session in this repo.
- **Not built:** the `agent_runs` / `outcomes` / `system_flags` migration isn't applied (the tables
  return 404), so nothing can be logged and the board can't be live.
- **Known wrong:** the Prospector's usable-rate (score ≥ 60, phone counts) doesn't match what Max
  actually picks (site read + email found + score ≥ 55). See the 10-27 lead-gen diagnosis.

So the order of work is: **make the agents real → log to `agent_runs` → bind the board to that
data → then the visual is honest.** Not the other way around.
