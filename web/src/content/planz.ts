/*
  Plan Z Motorsports demo (/demo/plan-z): every word and every example record the demo shows.
  Facts about Plan Z (cars, tracks, series, deposit and balance terms, inquiry form fields) come
  from planzracing.com. Drivers, prices and bookings are example data, labelled as such on screen.
  Dates are offsets in days from the day the page is opened, so the demo always looks current.
*/

export type SeatStatus = "open" | "interested" | "committed" | "deposit" | "balance" | "paid";
export type Stage = "inquiry" | "contacted" | "qualified" | "approved" | "pending" | "confirmed";
export type Series = "Lucky Dog" | "ChampCar";

export const planz = {
  meta: {
    title: "Plan Z Motorsports · Driver CRM demo",
    description: "A working example of the driver and booking system Launch Control would build for Plan Z Motorsports.",
  },
  brand: {
    name: "Plan Z Motorsports",
    short: "Plan Z",
    logo: "/demo/plan-z/planz-logo-v1.png",
    hero: "/demo/plan-z/planz-370z-v1.webp",
    heroAlt: "The red Plan Z 370Z on track.",
    owner: "Jim Mitchell",
    bizdev: "Max",
    email: "info@planzracing.com",
    builtBy: "Built by Launch Control",
    exampleBadge: "Example data",
  },
  pricing: { seat: 2400, deposit: 600, depositDaysBefore: 30, balanceDaysAfter: 7, note: "Example pricing. Plan Z sets price per booking." },
  cars: [
    { id: "white", name: "2003 Nissan 350Z", short: "White 350Z", trans: "6-speed manual", color: "#e9ecef" },
    { id: "blue", name: "2007 Nissan 350Z", short: "Blue 350Z", trans: "6-speed manual", color: "#2f5fa8" },
    { id: "red", name: "2011 Nissan 370Z", short: "Red 370Z", trans: "7-speed automatic", color: "#e5372b" },
  ],
  seatsPerCar: 4,
  // [days from today, track, city, series, racing cars (the third car is the backup)]
  events: [
    [-12, "Atlanta Motorsports Park", "Dawsonville, GA", "ChampCar", ["red", "blue"]],
    [24, "Carolina Motorsports Park", "Kershaw, SC", "Lucky Dog", ["red", "white"]],
    [52, "Atlanta Motorsports Park", "Dawsonville, GA", "Lucky Dog", ["red", "blue"]],
    [80, "Barber Motorsports Park", "Leeds, AL", "ChampCar", ["red", "white"]],
    [108, "Virginia International Raceway", "Alton, VA", "ChampCar", ["blue", "white"]],
    [136, "Sebring International Raceway", "Sebring, FL", "Lucky Dog", ["red", "blue"]],
    [171, "Road Atlanta", "Braselton, GA", "ChampCar", ["red", "white"]],
    [199, "NOLA Motorsports Park", "Avondale, LA", "Lucky Dog", ["red", "blue"]],
    [227, "Carolina Motorsports Park", "Kershaw, SC", "ChampCar", ["blue", "white"]],
    [262, "Barber Motorsports Park", "Leeds, AL", "Lucky Dog", ["red", "white"]],
    [290, "Atlanta Motorsports Park", "Dawsonville, GA", "ChampCar", ["red", "blue"]],
    [318, "Circuit of the Americas", "Austin, TX", "ChampCar", ["red", "white"]],
  ] as [number, string, string, Series, string[]][],
  // Seat fill per event, in order: each string is one car's 4 seats.
  // o open · i interested · c committed · d deposit paid · b balance due · p paid in full
  seatPlan: [
    ["ppbp", "pbpb"],
    ["ddcd", "dcio"],
    ["dcci", "doio"],
    ["dcio", "ciio"],
    ["ciio", "iooo"],
    ["iooo", "iooo"],
    ["iooo", "oooo"],
    ["oooo", "iooo"],
    ["oooo", "oooo"],
    ["iooo", "oooo"],
    ["oooo", "oooo"],
    ["oooo", "oooo"],
  ],
  // Drivers, in the order the seat plan fills seats, then prospects not yet seated.
  // [name, city, experience, source, owner, interests, notes]
  drivers: [
    ["Dana Reyes", "Marietta, GA", "HPDE 4 · 6 seasons · Lucky Dog veteran", "Referral", "Jim", "Full season; prefers the 370Z", "Brought two friends last season."],
    ["Marcus Bell", "Greenville, SC", "SCCA licence · ChampCar 3 seasons", "Website form", "Max", "Night stints", "Asked about a season package."],
    ["Priya Nair", "Charlotte, NC", "HPDE 3 · first endurance race last year", "Max outreach", "Max", "Coaching between stints", "Found through the AMP track day list."],
    ["Tom Okafor", "Birmingham, AL", "HPDE 4 instructor", "Track day rental", "Jim", "Manual 350Z only", "Rented the white 350Z at a track day."],
    ["Lena Fischer", "Atlanta, GA", "ChampCar 2 seasons", "GridSeat", "Jim", "Video and data package", "Moved over from GridSeat bookings."],
    ["Chris Albright", "Chattanooga, TN", "HPDE 3 · autocross", "Website form", "Max", "First endurance race", "Needs a loaner cooling shirt."],
    ["Sam Whitaker", "Columbia, SC", "Lucky Dog 4 seasons", "Referral", "Jim", "Bringing a co-driver", "Co-driver is Ben Ross."],
    ["Ben Ross", "Columbia, SC", "HPDE 4", "Referral", "Jim", "Drives with Sam Whitaker", ""],
    ["Jordan Price", "Nashville, TN", "SCCA licence · Spec Miata", "Max outreach", "Max", "Wants seat time before race weekend", "Booked a track day rental first."],
    ["Alexis Moreau", "Savannah, GA", "HPDE 3", "Website form", "Max", "Sebring and VIR", ""],
    ["Kevin Tran", "Raleigh, NC", "ChampCar 1 season", "Max outreach", "Max", "Two races this year", "Budgeting for two weekends."],
    ["Rachel Kim", "Atlanta, GA", "HPDE 4 · NASA TT", "Referral", "Jim", "Full season", "Corporate team-building idea for her company."],
    ["Diego Alvarez", "Austin, TX", "Lucky Dog 2 seasons", "Website form", "Max", "COTA", "Will only travel for COTA and NOLA."],
    ["Hannah Cole", "Knoxville, TN", "HPDE 3", "Max outreach", "Max", "First endurance race", ""],
    ["Owen Brooks", "Mobile, AL", "HPDE 4", "GridSeat", "Jim", "Barber and NOLA", "Raced with Plan Z twice before."],
    ["Nina Patel", "Durham, NC", "SCCA licence", "Website form", "Max", "Video and data package", ""],
    ["Victor Hale", "Augusta, GA", "Lucky Dog veteran", "Referral", "Jim", "Endurance team-mate for a friend", ""],
    ["Grace Liu", "Charleston, SC", "HPDE 2", "Website form", "Max", "Needs coaching", "Not cleared to race yet; suggested a track day."],
    ["Ethan Moss", "Huntsville, AL", "HPDE 3", "Max outreach", "Max", "Barber", ""],
    ["Maya Brooks", "Tampa, FL", "HPDE 4", "Website form", "Max", "Sebring", ""],
    ["Luis Ortega", "Houston, TX", "ChampCar 1 season", "Max outreach", "Max", "COTA", ""],
    ["Brianna Shaw", "Roanoke, VA", "HPDE 3", "Website form", "Max", "VIR", ""],
    ["Aaron Feld", "Atlanta, GA", "HPDE 4", "Track day rental", "Jim", "Full season", ""],
    ["Tessa Grant", "Asheville, NC", "HPDE 3", "Max outreach", "Max", "First endurance race", ""],
    // Not seated yet: pipeline prospects.
    ["Noah Kessler", "Macon, GA", "HPDE 2", "Website form", "Max", "Asked about requirements", ""],
    ["Isabel Vega", "Orlando, FL", "HPDE 3", "Max outreach", "Max", "Sebring", ""],
    ["Will Danforth", "Spartanburg, SC", "Autocross only", "Website form", "Max", "Wants a track day first", ""],
    ["Carmen Ruiz", "San Antonio, TX", "SCCA licence", "Max outreach", "Max", "COTA", ""],
    ["Pete Lawson", "Athens, GA", "HPDE 4", "Referral", "Jim", "Two to three races", ""],
    ["Jade Morgan", "Wilmington, NC", "HPDE 3", "Website form", "Max", "First endurance race", ""],
    ["Reggie Tate", "Montgomery, AL", "Lucky Dog 1 season", "Max outreach", "Max", "Barber", ""],
    ["Sofia Lind", "Atlanta, GA", "HPDE 4", "Website form", "Max", "Full season", ""],
  ] as [string, string, string, string, string, string, string][],
  // Stages for the not-yet-seated prospects above, in order.
  prospectStages: ["inquiry", "inquiry", "contacted", "contacted", "qualified", "qualified", "approved", "approved"] as Stage[],
  stages: [
    { id: "inquiry", label: "New inquiry" },
    { id: "contacted", label: "Contacted" },
    { id: "qualified", label: "Qualified" },
    { id: "approved", label: "Approved" },
    { id: "pending", label: "Booking pending" },
    { id: "confirmed", label: "Confirmed" },
  ] as { id: Stage; label: string }[],
  seatStatus: {
    open: { label: "Open seat", short: "Open" },
    interested: { label: "Interested, not committed", short: "Interested" },
    committed: { label: "Committed, deposit not paid", short: "Committed" },
    deposit: { label: "Deposit paid", short: "Deposit paid" },
    balance: { label: "Raced, balance due", short: "Balance due" },
    paid: { label: "Paid in full", short: "Paid in full" },
  } as Record<SeatStatus, { label: string; short: string }>,
  sequences: [
    {
      id: "welcome", name: "New inquiry", trigger: "When the inquiry form is sent",
      steps: ["Reply with the schedule, driver requirements and open seats", "Task for Max: call and qualify", "Second note if there is no reply", "Task for Jim: approve the driver"],
    },
    {
      id: "hold", name: "Interested, not committed", trigger: "Driver holds a seat but hasn't committed",
      steps: ["60 days before the race: seats are filling, here's what's left", "45 days before: contract and waiver sent", "35 days before: last call, then the seat goes to the waitlist"],
    },
    {
      id: "deposit", name: "Deposit due", trigger: "Committed, deposit not paid",
      steps: ["37 days before the race: deposit reminder with payment link", "33 days before: second reminder", "30 days before: deposit due today; task for Jim if unpaid"],
    },
    {
      id: "balance", name: "Balance due", trigger: "After the race weekend",
      steps: ["Day after the race: thank you, photos, balance and payment link", "5 days after: balance reminder", "7 days after: balance due today; task for Jim if unpaid"],
    },
    {
      id: "next", name: "Next race invite", trigger: "Paid in full",
      steps: ["Invite to the next race with open seats", "Season package offer for repeat drivers"],
    },
  ],
  copy: {
    nav: {
      dashboard: "Dashboard", calendar: "Race calendar", event: "Race weekend", drivers: "Drivers",
      pipeline: "Pipeline", payments: "Payments", followups: "Follow-ups", form: "Inquiry form",
    },
    intro: {
      title: "Plan Z's driver and booking system",
      body: "Every race weekend, every seat, every driver and every payment in one place. Max brings in and qualifies drivers, the system follows up until seats are committed and paid, and Jim sees where every weekend stands.",
      cta: "Open the dashboard",
    },
    dashboard: {
      title: "Dashboard",
      kpis: { events: "Race weekends ahead", filled: "Seats committed", open: "Open seats", deposits: "Deposits outstanding", attention: "Drivers needing follow-up" },
      nextRace: "Next race weekend",
      needsFollowUp: "Needs follow-up",
      deadlines: "Payment deadlines",
      fromMax: "Business development (Max)",
      season: "Season at a glance",
      viewEvent: "Open race weekend",
      none: "Nothing due.",
    },
    calendar: { title: "Race calendar", sub: "Two cars race each weekend with four drivers each. The third car comes as the backup.", seats: "seats committed", backup: "Backup", past: "Raced" },
    event: {
      title: "Race weekend", choose: "Race weekend", depositDue: "Deposit due", balanceDue: "Balance due", waitlist: "Waitlist",
      assign: "Assign a driver", markDeposit: "Mark deposit paid", markPaid: "Mark paid in full", commit: "Mark committed", remind: "Send reminder", release: "Release seat",
      reminded: "Reminder sent", seat: "Seat", stint: "Stints are set on race weekend.", empty: "Open seat", pickDriver: "Choose a driver",
    },
    drivers: { title: "Drivers", search: "Search drivers", cols: { name: "Driver", experience: "Experience", stage: "Stage", next: "Next race", owner: "Owner", source: "Source" } },
    driver: {
      contact: "Contact", experience: "Driving experience", interests: "Interests", events: "Races with Plan Z", comms: "Communication",
      payments: "Payments", notes: "Notes", stage: "Pipeline stage", owner: "Owner", source: "Source", advance: "Move to", close: "Close", none: "None yet.",
      email: "Email", phone: "Phone", logCall: "Log a call", callLogged: "Called; left the next step in notes.",
    },
    pipeline: { title: "Pipeline", sub: "Max moves drivers from first inquiry to a confirmed seat. Each card shows who owns the next step.", back: "Back", forward: "Next", newFlag: "New" },
    payments: {
      title: "Payments", sub: "Deposit due 30 days before the race. Balance due 7 days after the race weekend.",
      cols: { driver: "Driver", race: "Race weekend", status: "Status", amount: "Amount due", due: "Due" },
      overdue: "Overdue", dueSoon: "Due soon", totals: { deposits: "Deposits outstanding", balances: "Balances outstanding", collected: "Collected" },
    },
    followups: { title: "Follow-ups", sub: "Sequences run on their own. Max and Jim only step in when a task comes up.", queue: "Going out next", sequences: "Sequences", send: "Send now", skip: "Skip", sent: "Sent", on: "On", off: "Off", trigger: "Starts" },
    form: {
      title: "Request a seat", sub: "Tell us about your driving and pick a race weekend. Jim or Max will get back to you.",
      fields: { name: "Name", email: "Email", phone: "Phone", experience: "HPDE experience", experienceHint: "Your High-Performance Driving Event background.", video: "Reference-lap video URL", car: "Preferred car", series: "Target series", event: "Race weekend", shirt: "Loaner Chillout cooling shirt", message: "Message" },
      seriesOptions: ["Lucky Dog Racing League", "ChampCar Endurance Series"], noPref: "No preference", notSure: "Not sure yet", shirtNo: "No, I have my own", shirtYes: "Yes, please",
      submit: "Send inquiry", thanks: "Inquiry received", thanksBody: "This is what happens next in Plan Z's system: the driver is in the pipeline as a new inquiry, the welcome email is queued, and Max has a task to call.",
      seeIt: "See it in the pipeline", another: "Send another",
      frame: "What drivers see on planzracing.com", seatsLeft: "seats open", full: "waitlist",
    },
    common: { overdue: "overdue", today: "Today", by: "by", reset: "Reset demo", exampleNote: "Everything here is example data." },
  },
} as const;

export type PlanzContent = typeof planz;
