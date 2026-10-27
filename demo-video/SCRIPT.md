# Launch Control CRM — sales demo video

**Who it's for:** owners of motorsport businesses (race teams, schools, track-day outfits, prep shops).
**The one idea:** every inquiry gets answered, every follow-up goes out, every deal gets closed, and the owner just works one list.
**Rules:** our brand, our real CRM screens, only things the CRM actually does today. No voiceover, no time or speed claims, no made-up stats.
**Story:** Northline Performance (the CRM's own demo company; owner Alex Morgan) runs arrive-and-drive race weekends. A driver, Jake Turner, asks about one.
**Length:** about 60 seconds. 1920×1080. Every scene: one screen, one action, one zoom, one caption.

A rail across the top tracks the journey and lights up as it goes:
`Inquiry → Reply → Follow-up → Call → Deal → Won`

| # | Beat | On screen (real CRM) | The one action | Camera | Caption (headline / line) |
|---|---|---|---|---|---|
| 0 | Hook | Black, livery stripe, big type, three lines stack | — | — | "Inquiries get buried." / "Follow-ups get forgotten." / "Deals go quiet." |
| 1 | Brand | Launch Control mark builds, stripe draws | — | — | "Launch Control CRM" / "Nothing gets dropped." |
| 2 | Inquiry | Northline's website form → the CRM's **Today** screen | Jake submits the form; his row lands at the top marked **New inquiry · Start here** | Push in on his row | "Every inquiry lands on Today." / "Who wrote, what they want, and what to do first." |
| 3 | Reply | Jake's **lead record**: his message, the reply box | Alex types a reply, presses **Send reply**; **Next step** flips to *Follow up if no reply · Due Fri* | Reply box, then the Next step | "Reply once. The follow-up is already scheduled." / "If he goes quiet, it's drafted for you. If he answers, it stops." |
| 4 | He writes back | **Today**: Jake's row, folded | Alex opens the row: his message and **Your reply, drafted**; presses **Send reply** | The drafted reply | "He wrote back. Your answer is already written." / "Read it, change it if you want, send. Nothing goes out without you." |
| 5 | Call | **Calendar**, the day of the call | The call sits on the day, linked to Jake | The day's agenda | "Book the call. It lands on his record and in Outlook." / "His status moves to Meeting set on its own." |
| 6 | Deal → Won | **Pipeline** board | Jake's $8,500 card drags from **Proposal out** to **Won**; the Won column total climbs | His card, then the Won column | "Drag it to Won. He's a customer." / "The follow-ups stop. The pipeline updates itself." |
| 7 | A normal morning | **Today** with a full day in motion | The list fills in order; the pipeline column counts up | Wide, slow push | "Every morning, one list." / "Who to answer, in order, with the reply already written." |
| 8 | Close | Launch Control mark + URL | — | — | "Launch Control" / "Built for motorsport businesses · golaunchcontrol.com" |

## What's true behind each claim (from the code)
- Website inquiries become a lead, due today, on Today (`crm/src/app/api/inquiry/route.ts`).
- Sending an email sets the next follow-up 3 business days out (`20261027000001_gone_quiet.sql`, `stamp_lead_contacted`).
- Follow-ups and replies are drafted by the worker; a person sends unless auto-send is switched on (`tools/leadgen/leadgen/automation.py`).
- A reply stops pending follow-ups and puts the lead back on Today (trigger in the same migration).
- Calendar events copy to Outlook, and a linked event sets status *Meeting set* (`calendar/actions.ts`, `stamp_lead_meeting`).
- Dragging a deal to Won creates the customer (`crm/src/lib/store/deals.ts:82`).

## Not in this video (on purpose)
Seats, deposits and event setup for race teams (Max's list) are not built yet, so they stay out. Lead Gen and Campaigns are real, but they belong in their own video.
