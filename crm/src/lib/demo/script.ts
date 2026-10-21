// The walkthrough: one website inquiry taken from "just came in" to "signed", one screen at a
// time. Each step is the state the database is put into, the screen that shows it, and the one
// thing Max says. Step 0 is an empty CRM; the last step is a full working day.

export interface DemoStep {
  /** Short heading on the card. */
  title: string;
  /** What Max reads aloud. One or two sentences. */
  say: string;
  /** Where the CRM goes to show it. `{lead}` is the walkthrough lead's id, `{tomorrow}` the team's next calendar day. */
  route: string;
}

export const DEMO_STEPS: DemoStep[] = [
  {
    title: "An empty CRM",
    say: "This is day one. Nothing in it yet. Watch what happens when someone fills out the form on your website.",
    route: "/admin/dashboard",
  },
  {
    title: "A lead comes in",
    say: "Someone just filled out the form on your website. He's already on your Today screen, with what he wrote, before anyone touched it.",
    route: "/admin/dashboard",
  },
  {
    title: "You reply in one click",
    say: "The reply came from a template and went out in one click. He moved to Waiting on them, and a follow-up is already scheduled in case he goes quiet.",
    route: "/admin/leads/{lead}",
  },
  {
    title: "He writes back",
    say: "He wrote back. He's at the top of Today with a reply already drafted. Nothing sits in an inbox waiting for you to notice it.",
    route: "/admin/dashboard",
  },
  {
    title: "The call is booked",
    say: "The call is on the calendar and attached to his record, so the history is in one place when you pick up the phone.",
    route: "/admin/calendar?day={tomorrow}",
  },
  {
    title: "The proposal goes out",
    say: "The proposal went out and he's a deal in the pipeline now. If he goes quiet, the CRM nudges you. You never have to remember.",
    route: "/admin/deals",
  },
  {
    title: "He signs",
    say: "He signed. The follow-ups stop, the deal shows won, and he's a customer. From a web form to a signed deal with nothing dropped.",
    route: "/admin/deals",
  },
  {
    title: "A normal morning",
    say: "This is what it looks like with ten of these in motion. Everything waiting on you, in order, with the reply already written. Click anywhere.",
    route: "/admin/dashboard",
  },
];

export const LAST_STEP = DEMO_STEPS.length - 1;
