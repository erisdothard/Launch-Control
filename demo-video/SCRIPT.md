# Launch Control CRM — sales demo video

**Who it's for:** owners of motorsport businesses (race teams, schools, track-day outfits, prep shops).
**The one idea:** every inquiry gets answered, every follow-up goes out, every deal gets closed, and the owner just works one list.
**Rules:** our brand, our real CRM screens, only things the CRM actually does today. No voiceover, no time or speed claims, no made-up stats.
**Story:** Northline Performance (the CRM's own demo company; owner Alex Morgan) runs arrive-and-drive race weekends. A driver, Jake Turner, asks about one.
**Length:** 61 seconds. 1920×1080. Every scene: one screen, one action, one zoom, one caption.

A rail across the top tracks the journey and lights up as it goes:
`Inquiry → Reply → Follow-up → Call → Deal → Won`

Build: `launch-control-crm/build/` (capture.py pulls the real screens from the local CRM, build.py assembles index.html).

| # | Beat | On screen (real CRM) | The one action | Camera | Caption (headline / line) |
|---|---|---|---|---|---|
| 0 | Hook | Black, livery stripe, four lines stack | — | — | "A driver asks about a race weekend." / "The email gets buried." / "The follow-up never goes out." / "He books with someone else." |
| 1 | Brand | Launch Control logo, stripe | — | — | "Nothing gets dropped." |
| 2 | Inquiry | Northline's website form → **Today**, first the real empty state (*You're clear*) | Jake types and sends; Today goes from clear to his row, **New inquiry · Start here** | Push in on the form, then on his row | "Every inquiry lands on Today." / "Who wrote, what they want, and what to do first." |
| 3 | Reply | Jake's **lead record** | Alex types the reply and sends; **Next step** becomes *Follow up if no reply · Due Fri, Oct 30* | Reply box, then the Next step | "Reply once. The follow-up is already set." / "If he goes quiet, the next email is drafted for you. If he answers, it stops." |
| 4 | He writes back | **Today**: Jake (waiting 2 hours) above Kevin (40 minutes) above Sofia's follow-up, the CRM's real order | Alex opens Jake's row: his message and **Your reply, drafted** (offers a call, no prices); sends | The drafted reply | "Your answer is already written." / "Read it, change it if you want, and send. Replies never go out on their own." |
| 5 | Call + deal | **Calendar** (Thu, Oct 29 · 1:00), then his **record** | The call is on the day and in the agenda; his status reads *Meeting set*; Alex clicks **Create deal** | Agenda + Thursday, then status, then Create deal | "Book the call. Everything updates." / "On his record and in your Outlook, and his status moves on its own. Then create the deal right there." |
| 6 | Won | **Pipeline** board | Jake's $8,500 card drags from **Inquiry** to **Won**; Won goes $18,500 → $27,000 | Card drag, then the Won column | "Drag it to Won. He's a customer." / "When he signs, drag the deal to Won. The pipeline and his record update together." |
| 7 | A normal morning | **Today** with a full day | Rows fill in order; the pipeline panel shows $129,500 open, $27,000 won | List, then the pipeline panel | "One list. In order. Drafts ready." / "Replies, follow-ups and new inquiries, with your pipeline beside them." |
| 8 | Close | Launch Control logo + CTA | — | — | "Every inquiry answered. Every deal tracked." / "The CRM built for motorsport businesses." / **Book a demo** · golaunchcontrol.com |

Sample data is labelled in the browser bar. All numbers reconcile across Today and Pipeline.

## What's true behind each claim (from the code)
- Website inquiries become a lead, due today, on Today (`crm/src/app/api/inquiry/route.ts`).
- Sending an email sets the next follow-up 3 business days out (`20261027000001_gone_quiet.sql`, `stamp_lead_contacted`).
- Follow-ups and replies are drafted by the worker; a person sends unless auto-send is switched on (`tools/leadgen/leadgen/automation.py`).
- A reply stops pending follow-ups and puts the lead back on Today (trigger in the same migration).
- Calendar events copy to Outlook, and a linked event sets status *Meeting set* (`calendar/actions.ts`, `stamp_lead_meeting`).
- Dragging a deal to Won creates the customer (`crm/src/lib/store/deals.ts:82`).

## Not in this video (on purpose)
Seats, deposits and event setup for race teams (Max's list) are not built yet, so they stay out. Lead Gen and Campaigns are real, but they belong in their own video.
