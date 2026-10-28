<!doctype html>
<html lang="en" data-resolution="landscape" class="sora_ae4e95a5-module__wIwuFq__variable michroma_9088effe-module__IduOgG__variable chivo_mono_69dfaf15-module__co35da__variable">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=1920, height=1080" />
    <title>Launch Control CRM demo</title>
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
    <link rel="stylesheet" href="crm/crm.css" />
    <style>
      html, body { margin: 0; width: 1920px; height: 1080px; overflow: hidden; background: #060708; }
      body { font-family: var(--font-body); color: var(--color-text); -webkit-font-smoothing: antialiased; }
      #root { position: relative; width: 1920px; height: 1080px; overflow: hidden; }
      .layer { position: absolute; inset: 0; }

      /* Ground: the CRM's own page colours, a faint grid and one warm glow. */
      #ground { background: radial-gradient(1100px 760px at 78% 46%, #15130c 0%, #0a0c0e 58%, #060708 100%); }
      #grid { background-image: linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px); background-size: 64px 64px; }
      #glow { left: 1000px; top: 120px; width: 900px; height: 900px; right: auto; bottom: auto; border-radius: 50%; background: radial-gradient(circle, rgba(240,196,25,0.10) 0%, rgba(240,196,25,0) 62%); }
      .stripe { position: absolute; left: 0; top: 0; height: 6px; display: flex; width: 1920px; }
      .stripe i { display: block; height: 6px; }

      /* Journey rail */
      #rail { position: absolute; left: 560px; top: 52px; width: 1300px; height: 40px; display: flex; align-items: center; gap: 10px; }
      .step { display: flex; align-items: center; gap: 10px; font-family: var(--font-mono); font-size: 15px; letter-spacing: 0.14em; text-transform: uppercase; color: #59606a; }
      .step b { display: block; width: 26px; height: 26px; border-radius: 50%; box-shadow: inset 0 0 0 2px #2a2f36; position: relative; }
      .step b::after { content: ""; position: absolute; inset: 6px; border-radius: 50%; background: var(--color-accent); opacity: 0; }
      .step .lit { position: absolute; inset: 0; border-radius: 50%; box-shadow: inset 0 0 0 2px var(--color-accent); opacity: 0; }
      .step .dot { position: absolute; inset: 7px; border-radius: 50%; background: var(--color-accent); transform: scale(0); }
      .step span { opacity: 1; }
      .step span.on { position: absolute; color: var(--color-text); opacity: 0; }
      .seg { flex: 1; height: 2px; background: #22262c; position: relative; }
      .seg i { position: absolute; inset: 0; background: var(--color-accent); transform-origin: 0 50%; transform: scaleX(0); display: block; }

      /* Browser window around the real CRM */
      #win { position: absolute; left: 560px; top: 110px; width: 1300px; height: 853px; border-radius: 16px; overflow: hidden; background: #0a0c0e; box-shadow: 0 0 0 1px rgba(255,255,255,0.12), 0 50px 140px rgba(0,0,0,0.7); }
      #chrome { position: absolute; left: 0; top: 0; width: 1300px; height: 40px; background: #121417; display: flex; align-items: center; gap: 8px; padding: 0 16px; border-bottom: 1px solid rgba(255,255,255,0.07); }
      #chrome i { width: 12px; height: 12px; border-radius: 50%; background: #2c3036; display: block; }
      #chrome .url { position: relative; margin-left: 18px; width: 330px; height: 26px; border-radius: 7px; background: #0a0c0e; font-family: var(--font-mono); font-size: 13px; line-height: 26px; color: #8b939c; }
      #chrome .url span { position: absolute; left: 14px; top: 0; white-space: nowrap; }
      #u2 { opacity: 0; }
      #chrome .sample { margin-left: auto; padding: 4px 10px; border-radius: 6px; background: rgba(240,196,25,0.12); font-family: var(--font-mono); font-size: 13px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--color-accent); }
      #port { position: absolute; left: 0; top: 40px; width: 1300px; height: 813px; overflow: hidden; }
      #view { position: absolute; left: 0; top: 0; width: 1440px; height: 900px; transform-origin: 0 0; }
      .screen { position: absolute; left: 0; top: 0; width: 1440px; height: 900px; opacity: 0; overflow: hidden; z-index: 1; }
      #view > .spot { z-index: 10; }
      @font-face { font-family: 'Eurostile'; src: local('Eurostile'); }
      @font-face { font-family: 'Bank Gothic'; src: local('Bank Gothic'); }
      @font-face { font-family: 'Apple Color Emoji'; src: local('Apple Color Emoji'); }
      @font-face { font-family: 'Segoe UI Emoji'; src: local('Segoe UI Emoji'); }
      @font-face { font-family: 'Segoe UI Symbol'; src: local('Segoe UI Symbol'); }
      @font-face { font-family: 'Noto Color Emoji'; src: local('Noto Color Emoji'); }
      .screen > div.fixed { position: absolute !important; inset: 0 !important; width: 1440px !important; height: 900px !important; }
      .screen aside.fixed { position: absolute !important; height: 900px !important; }

      /* Captions */
      .cap { position: absolute; left: 88px; top: 150px; width: 440px; opacity: 0; }
      .cap .no { font-family: var(--font-mono); font-size: 17px; letter-spacing: 0.16em; text-transform: uppercase; color: var(--color-accent); }
      .cap .rule { display: flex; width: 84px; height: 3px; margin: 18px 0 26px; }
      .cap .rule i { display: block; height: 3px; }
      .cap h2 { margin: 0; font-family: var(--font-body); font-weight: 600; font-size: 46px; line-height: 1.08; letter-spacing: -0.03em; color: var(--color-steel); }
      .cap p { margin: 22px 0 0; font-size: 23px; line-height: 1.5; color: var(--color-text-muted); }
      .ticks { margin-top: 40px; display: flex; flex-direction: column; gap: 16px; }
      .tick { display: flex; align-items: center; gap: 14px; font-size: 20px; color: var(--color-text); opacity: 0; }
      .tick b { flex: none; width: 26px; height: 26px; border-radius: 7px; display: grid; place-items: center; background: rgba(240,196,25,0.14); color: var(--color-accent); font-size: 15px; }

      /* Overlays inside the CRM view */
      .spot { position: absolute; border-radius: 12px; box-shadow: 0 0 0 2px var(--color-accent), 0 0 0 4000px rgba(4, 5, 6, 0.62); opacity: 0; pointer-events: none; }
      .spot.soft { box-shadow: 0 0 0 2px var(--color-accent), 0 0 0 4000px rgba(4, 5, 6, 0.34); }
      .spot .lbl { position: absolute; left: -2px; bottom: calc(100% + 10px); white-space: nowrap; background: var(--color-accent); color: var(--color-on-accent); font-family: var(--font-display); font-size: 12px; letter-spacing: 0.14em; text-transform: uppercase; padding: 7px 11px; border-radius: 6px; }
      .spot .lbl.below { bottom: auto; top: calc(100% + 10px); }
      .spot .lbl.inside { left: auto; right: 14px; bottom: auto; top: 50%; transform: translateY(-50%); }
      .spot .lbl.foot { left: auto; right: 12px; bottom: 12px; }
      #cursor { position: absolute; left: 0; top: 0; width: 34px; height: 40px; z-index: 60; transform-origin: 0 0; filter: drop-shadow(0 4px 8px rgba(0,0,0,0.6)); opacity: 0; }
      #ripple { position: absolute; left: -24px; top: -24px; width: 48px; height: 48px; border-radius: 50%; box-shadow: 0 0 0 3px var(--color-accent); opacity: 0; z-index: 59; }
      #typed { position: absolute; background: var(--color-bg-secondary); padding: 10px 14px; font-size: 16px; line-height: 1.6; white-space: pre-wrap; color: var(--color-text); opacity: 0; z-index: 5; }
      #toast { position: absolute; left: 560px; top: 806px; display: flex; align-items: center; gap: 20px; padding: 13px 20px; border-radius: 12px; background: #1c2026; box-shadow: 0 0 0 1px rgba(255,255,255,0.1), 0 20px 50px rgba(0,0,0,0.5); font-size: 15px; color: var(--color-text); opacity: 0; z-index: 30; }
      #toast b { color: var(--color-accent); font-weight: 600; }
      #floater { position: absolute; width: 256px; z-index: 40; opacity: 0; }

      /* Website form (Northline's own site) */
      #site { position: absolute; left: 0; top: 0; width: 1440px; height: 900px; z-index: 20; background: #e9ebef; color: #14171c; opacity: 0; }
      #site .nav { height: 72px; background: #0d0f12; color: #c6ccd3; display: flex; align-items: center; gap: 34px; padding: 0 48px; font-size: 15px; }
      #site .nav b { font-family: var(--font-display); font-weight: 400; font-size: 14px; letter-spacing: 0.16em; text-transform: uppercase; color: #f1f3f5; margin-right: auto; }
      #site .nav .on { color: var(--color-accent); }
      #site .hero { position: absolute; left: 80px; top: 210px; width: 330px; }
      #site .hero h1 { margin: 0; font-size: 50px; font-weight: 600; letter-spacing: -0.04em; line-height: 1; }
      #site .hero p { margin: 22px 0 0; font-size: 22px; color: #4b525b; }
      #form { position: absolute; left: 760px; top: 130px; width: 560px; height: 560px; border-radius: 16px; background: #ffffff; color: #14171c; box-shadow: 0 30px 80px rgba(10,14,20,0.18); }
      #form .top { height: 46px; background: #14171c; color: #f4f5f7; display: flex; align-items: center; justify-content: space-between; padding: 0 20px; font-family: var(--font-display); font-size: 11px; letter-spacing: 0.16em; text-transform: uppercase; }
      #form .top span { font-family: var(--font-mono); font-size: 11px; letter-spacing: 0; text-transform: none; color: #8b939c; }
      #form h3 { margin: 26px 26px 4px; font-size: 24px; font-weight: 600; letter-spacing: -0.02em; }
      #form .hint { margin: 0 26px 18px; font-size: 15px; color: #5b626a; }
      #form .f { margin: 0 26px 14px; }
      #form label { display: block; font-size: 12px; font-weight: 600; color: #3b424b; margin-bottom: 5px; }
      #form .in { min-height: 42px; border-radius: 8px; background: #f6f7f9; box-shadow: inset 0 0 0 1.5px #d6dae0; padding: 10px 12px; font-size: 16px; line-height: 1.45; }
      #form .in span { opacity: 0; }
      #form .send { position: absolute; left: 26px; top: 486px; height: 46px; width: 140px; border-radius: 8px; background: #14171c; color: #fff; display: grid; place-items: center; font-family: var(--font-display); font-size: 11px; letter-spacing: 0.16em; text-transform: uppercase; }

      /* Full-frame cards */
      .full { background: #060708; }
      #hook .lines { position: absolute; left: 180px; top: 300px; display: flex; flex-direction: column; gap: 22px; }
      #hook .ln { font-size: 74px; font-weight: 600; letter-spacing: -0.035em; line-height: 1.05; color: var(--color-steel); opacity: 0; }
      #hook .ln.hot { color: var(--color-hot); }
      #brand .in, #close .in { position: absolute; left: 0; top: 0; width: 1920px; height: 1080px; display: flex; flex-direction: column; align-items: center; justify-content: center; }
      #brand img, #close img { width: 760px; height: auto; }
      .bigline { margin-top: 44px; font-size: 64px; font-weight: 600; letter-spacing: -0.035em; color: var(--color-text); }
      .bigline em { font-style: normal; color: var(--color-accent); }
      .sub { margin-top: 22px; font-size: 26px; color: var(--color-text-muted); }
      .cta { margin-top: 48px; display: flex; align-items: center; gap: 28px; }
      .cta .btn-y { height: 72px; padding: 0 40px; border-radius: 10px; background: var(--color-accent); color: var(--color-on-accent); display: grid; place-items: center; font-family: var(--font-display); font-size: 20px; letter-spacing: 0.14em; text-transform: uppercase; }
      .cta .site { font-size: 34px; font-weight: 600; letter-spacing: -0.02em; color: var(--color-text); }
      .bar { display: flex; width: 360px; height: 6px; margin-top: 40px; transform-origin: 50% 50%; }
      .bar i { display: block; height: 6px; }
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="61" data-width="1920" data-height="1080">
      <section id="stage" class="clip layer" data-start="0" data-duration="61" data-track-index="1">
        <div id="ground" class="layer"></div>
        <div id="grid" class="layer"></div>
        <div id="glow" class="layer"></div>
        <div class="stripe"><i style="width: 768px; background: var(--color-livery-red)"></i><i style="width: 480px; background: var(--color-livery-orange)"></i><i style="width: 576px; background: var(--color-accent)"></i><i style="width: 96px; background: var(--color-livery-green)"></i></div>

        <div id="rail">
          {{RAIL}}
        </div>

        {{CAPTIONS}}

        <div id="win">
          <div id="chrome"><i></i><i></i><i></i><div class="url"><span id="u1">northlineperformance.com/contact</span><span id="u2">crm.golaunchcontrol.com</span></div><div class="sample">Sample data</div></div>
          <div id="port">
            <div id="view">
              {{SCREENS}}
              <div id="site">
                <div class="nav"><b>Northline Performance</b><span>Race weekends</span><span>Test days</span><span>Coaching</span><span class="on">Contact</span></div>
                <div class="hero"><h1>Arrive and drive.</h1><p>Car, coach and crew handled. You just race.</p></div>
              <div id="form">
                <h3>Book a race weekend</h3>
                <div class="hint">Tell us about your racing. We'll build the weekend around you.</div>
                <div class="f"><label>Name</label><div class="in"><span id="fv-name">Jake Turner</span></div></div>
                <div class="f"><label>Email</label><div class="in"><span id="fv-email">jake.turner@gmail.com</span></div></div>
                <div class="f"><label>Message</label><div class="in" style="min-height: 92px"><span id="fv-msg"></span></div></div>
                <div class="send" id="fsend">Send</div>
              </div>
              </div>
              <div id="typed"></div>
              <div id="floater"></div>
              <div id="toast">Reply sent to Jake<b>Undo</b></div>
              <div id="ripple"></div>
              <svg id="cursor" viewBox="0 0 34 40" aria-hidden="true"><path d="M2 2 L2 32 L10 25 L15.5 37 L21 34.5 L15.5 23 L26 23 Z" fill="#ffffff" stroke="#0a0b0c" stroke-width="2.4" stroke-linejoin="round" /></svg>
            </div>
          </div>
        </div>

        <div id="hook" class="layer full">
          <div class="stripe"><i style="width: 768px; background: var(--color-livery-red)"></i><i style="width: 480px; background: var(--color-livery-orange)"></i><i style="width: 576px; background: var(--color-accent)"></i><i style="width: 96px; background: var(--color-livery-green)"></i></div>
          <div class="lines">
            <div class="ln" id="h1">A driver asks about a race weekend.</div>
            <div class="ln" id="h2">The email gets buried.</div>
            <div class="ln" id="h3">The follow-up never goes out.</div>
            <div class="ln hot" id="h4">He books with someone else.</div>
          </div>
        </div>
        <div id="brand" class="layer full" style="opacity: 0">
          <div class="stripe"><i style="width: 768px; background: var(--color-livery-red)"></i><i style="width: 480px; background: var(--color-livery-orange)"></i><i style="width: 576px; background: var(--color-accent)"></i><i style="width: 96px; background: var(--color-livery-green)"></i></div>
          <div class="in">
            <img id="brand-logo" src="assets/launch-control-logo-v3.svg" alt="Launch Control" />
            <div class="bigline" id="brand-line">Nothing gets <em>dropped.</em></div>
            <div class="bar" id="brand-bar"><i style="width: 40%; background: var(--color-livery-red)"></i><i style="width: 25%; background: var(--color-livery-orange)"></i><i style="width: 30%; background: var(--color-accent)"></i><i style="width: 5%; background: var(--color-livery-green)"></i></div>
          </div>
        </div>
        <div id="close" class="layer full" style="opacity: 0">
          <div class="stripe"><i style="width: 768px; background: var(--color-livery-red)"></i><i style="width: 480px; background: var(--color-livery-orange)"></i><i style="width: 576px; background: var(--color-accent)"></i><i style="width: 96px; background: var(--color-livery-green)"></i></div>
          <div class="in">
            <img id="close-logo" src="assets/launch-control-logo-v3.svg" alt="Launch Control" />
            <div class="bigline" id="close-line">Every inquiry answered. <em>Every deal tracked.</em></div>
            <div class="sub" id="close-sub">The CRM built for motorsport businesses.</div>
            <div class="cta" id="close-url"><div class="btn-y">Book a demo</div><div class="site">golaunchcontrol.com</div></div>
          </div>
        </div>
      </section>
    </div>
    <script>
      {{TIMELINE}}
    </script>
  </body>
</html>
