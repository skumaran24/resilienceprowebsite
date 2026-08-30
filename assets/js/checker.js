/* ============================================================
   ResiliencePro — BNM Applicability Checker
   ------------------------------------------------------------
   Content sourced from:
     - Risk Management in Technology (RMiT), BNM/RH/PD 028-98,
       issued 28 November 2025
     - Technology Requirements for Payment Services Regulatees
       (TR PD), BNM/RH/PD 040-1, issued 12 March 2026
     - RMiT Frequently Asked Questions, last updated 1 July 2026

   Maintenance note: every obligation below carries the paragraph
   reference it came from. When BNM revises a policy document,
   update OBLIGATIONS and DATES only — the routing logic in
   resolve() follows the applicability clauses (RMiT 2.1-2.2,
   TR PD 2.1-2.6) and changes far less often.
   ============================================================ */

(function () {
  'use strict';

  // Set this to your Azure Static Web Apps function route once /api is live.
  // Until then the form reports honestly that submission is not yet wired up.
  var LEAD_ENDPOINT = ''; // e.g. '/api/lead'

  // ---------------------------------------------------------
  // Key dates
  // ---------------------------------------------------------
  var DATES = {
    rmitIssued: '28 Nov 2025',
    rmitGap: '26 Feb 2026',       // RMiT 18.1 — 90 days after issuance
    trIssued: '12 Mar 2026',
    trGap: '10 Jun 2026',         // TR PD 17.1 — 90 days after issuance
    trEffective: '12 Mar 2027'    // TR PD 4.1 — one year after issuance
  };

  // ---------------------------------------------------------
  // Obligations that ResiliencePro is built to run and evidence.
  // status: 'S' = standard (enforceable), 'G' = guidance.
  // ---------------------------------------------------------
  var OBLIGATIONS = {
    rmit: [
      { ref: '18.1', status: 'S', what: 'Gap analysis and action plan',
        detail: 'Gap analysis against RMiT with an action plan carrying a clear timeline and key milestones. Institutions that submitted under an earlier version must identify new gaps against the revised requirements and keep an updated annual assessment of their compliance level available to BNM on request.' },
      { ref: '11.16', status: 'S', what: 'Annual cyber drill exercise',
        detail: 'Tests the cyber incident response plan across current and emerging threat scenarios, involving board members, senior management and relevant third party service providers. Results reported to the board in a timely manner. Scenarios must test escalation and decision-making at different impact levels, and CERT and third party readiness in recovery.' },
      { ref: '11.6', status: 'S', what: 'Red team simulation attack',
        detail: 'A realistic simulation, distinct in scope and scenario design from intelligence-led penetration testing even where the two exercises are coordinated for cost effectiveness.' },
      { ref: '11.15', status: 'S', what: 'Out-of-band communication channel',
        detail: 'Operationally independent of the primary network, subject to governance, periodic testing and ongoing review. Tested regularly as part of cyber drill exercises.' },
      { ref: '10.44(e)', status: 'S', what: 'Backup and restoration testing',
        detail: 'Periodic testing to validate recovery capability, with prompt remedial action to fix the root cause of unsuccessful backups.' },
      { ref: '10.45', status: 'S', what: 'Isolated recovery environment',
        detail: 'Tamper-proof backup arrangement and an isolated recovery environment enabling resumption of critical banking and payment services within tolerable levels after a destructive cyber-attack.' },
      { ref: '9.2(j)', status: 'S', what: 'Scenario analysis',
        detail: 'Recovery of critical services under severe but plausible stress. Complements component-level DR exercises rather than being replaced by them.' },
      { ref: '14.1 / 14.2', status: 'S', what: 'Data centre and network resilience assessments',
        detail: 'Assessment reports for production and recovery data centres hosting critical systems, and enterprise-wide network infrastructure, submitted to IT Supervisors.' },
      { ref: 'App. 5', status: 'S', what: 'Compromise assessment',
        detail: 'Conducted at least once every three years to provide assurance that the environment has not been subject to undetected compromise.' }
    ],
    tr: [
      { ref: '17.1', status: 'S', what: 'Gap analysis and action plan',
        detail: 'Gap analysis against the TR PD with an action plan carrying a clear timeline and key milestones, submitted to Jabatan Pemantauan Perkhidmatan Pembayaran.' },
      { ref: '11.16', status: 'S', tier3: 'G', what: 'Annual cyber drill exercise',
        detail: 'Tests the cyber incident response plan across current and emerging threat scenarios, involving board members, senior management and relevant third party service providers, with results reported to the board.' },
      { ref: '11.15', status: 'S', tier3: 'G', what: 'Out-of-band communication channel',
        detail: 'Secure and reliable channel for internal and external stakeholders, to maintain coordination if primary communication infrastructure is compromised during a crisis.' },
      { ref: '11.6', status: 'G', what: 'Red team simulation attack',
        detail: 'Encouraged rather than mandatory for PSRs under the TR PD, unlike the equivalent RMiT requirement.' },
      { ref: '11.9(a)', status: 'S', tier3: 'G', what: 'Security Operations Centre',
        detail: 'Continuous and proactive monitoring and timely detection of anomalous activity across the technology infrastructure.' },
      { ref: '10.37', status: 'S', tier3: 'G', what: 'No single point of failure in network services',
        detail: 'Network services supporting critical systems must be reliable and free of single points of failure.' },
      { ref: '13.3', status: 'S', what: 'Designated internal IT audit head',
        detail: 'Appropriately competent and professionally certified, conversant with the PSR\u2019s technology systems and delivery channels. Applies even to PSRs otherwise governed under RMiT.' },
      { ref: '9.6', status: 'S', tier3: 'G', what: 'CISO independent of technology operations',
        detail: 'The CISO must be independent from day-to-day technology operations.' }
    ]
  };

  // ---------------------------------------------------------
  // Question flow
  // ---------------------------------------------------------
  var QUESTIONS = [
    {
      id: 'entity',
      q: 'What is your organisation regulated as?',
      help: 'Pick the licence or registration you hold with Bank Negara Malaysia. If you hold more than one, pick the one with the largest payment business.',
      options: [
        { value: 'bank', label: 'Licensed bank, Islamic bank or investment bank' },
        { value: 'insurer', label: 'Insurer or takaful operator' },
        { value: 'dfi', label: 'Development financial institution', note: 'Prescribed institution under the DFIA' },
        { value: 'emi', label: 'Approved issuer of electronic money' },
        { value: 'ma', label: 'Registered merchant acquirer', note: 'Non-bank' },
        { value: 'msb', label: 'Licensed money services business', note: 'Remittance, currency exchange or wholesale currency' },
        { value: 'dps', label: 'Operator of a designated payment system' },
        { value: 'other', label: 'None of these' }
      ]
    },
    {
      id: 'notified',
      when: function (a) { return a.entity === 'emi' || a.entity === 'ma' || a.entity === 'msb'; },
      q: 'Has BNM notified you that you fall within the scope of RMiT?',
      help: 'BNM notifies e-money issuers with substantial market presence, and merchant acquirers or intermediary remittance institutions that meet the 5% market share threshold for transaction value or volume. Aggregate market data for non-bank merchant acquirers is not published, so the notification is how you find out.',
      options: [
        { value: 'yes', label: 'Yes, we have been notified' },
        { value: 'no', label: 'No', note: 'Or we are not sure' }
      ]
    },
    {
      id: 'nondigital',
      when: function (a) { return a.entity === 'msb' && a.notified === 'no'; },
      q: 'Do you offer digital services?',
      help: 'A non-digital money services business carrying on only currency exchange or wholesale currency business is tiered separately.',
      options: [
        { value: 'yes', label: 'Yes, we deliver services through electronic channels', note: 'Internet, mobile, self-service terminals or payment acceptance devices' },
        { value: 'no', label: 'No, currency exchange or wholesale currency only' }
      ]
    },
    {
      id: 'size',
      when: function (a) {
        return (a.entity === 'emi' || a.entity === 'ma' || a.entity === 'msb') &&
               a.notified === 'no' && a.nondigital !== 'no';
      },
      q: 'What is your annual transaction value or volume?',
      help: 'Sum across all regulated businesses in the entity, excluding currency exchange and wholesale currency. Where group entities share the same technology infrastructure or controls, their figures must be combined. Determined each January based on the previous calendar year.',
      options: [
        { value: 'large', label: 'More than RM1.5 billion in value, or more than 7 million transactions' },
        { value: 'small', label: 'RM1.5 billion or less in value, and 7 million transactions or fewer' }
      ]
    }
  ];

  // ---------------------------------------------------------
  // Routing — follows RMiT 2.1–2.2 and TR PD 2.1–2.6
  // ---------------------------------------------------------
  function resolve(a) {
    if (a.entity === 'other') {
      return {
        policy: 'Neither policy document applies directly',
        tier: '',
        summary: [
          'Neither RMiT nor the TR PD applies to organisations outside BNM regulation. Approved operators of payment systems regulated under the Payment System Operators policy document are also excluded from the TR PD.',
          'If you supply technology or managed services to a BNM-regulated institution, expect its third party requirements to be passed down to you contractually — including assurance over your own controls.'
        ],
        obligations: [],
        dates: []
      };
    }

    var isRmit = a.entity === 'bank' || a.entity === 'insurer' ||
                 a.entity === 'dfi' || a.entity === 'dps' || a.notified === 'yes';

    if (isRmit) {
      var extras = 'Because you are governed under RMiT, only paragraphs 2.7 and 13.3 and Appendix 10 of the TR PD apply to you.';
      if (a.entity === 'ma') {
        extras += ' Appendix 10, covering payment acceptance devices, applies to merchant acquiring business regardless of which policy governs you.';
      }
      return {
        policy: 'Risk Management in Technology (RMiT)',
        tier: 'Tier-1 under the TR PD tiering',
        summary: [
          'RMiT applies in full. The 28 November 2025 revision removed the previous distinction for large financial institutions, so baseline expectations now apply uniformly across the sector.',
          extras
        ],
        obligations: OBLIGATIONS.rmit,
        dates: [
          { label: 'Policy issued', value: DATES.rmitIssued, state: '', cls: '' },
          { label: 'Gap analysis and action plan due', value: DATES.rmitGap, state: 'Deadline passed', cls: 'past' },
          { label: 'Compliance assessment', value: 'Annual', state: 'Available to BNM on request', cls: 'due' }
        ]
      };
    }

    if (a.nondigital === 'no') {
      return {
        policy: 'Technology Requirements for Payment Services Regulatees',
        tier: 'Tier-4',
        summary: [
          'As a non-digital money services business carrying on currency exchange or wholesale currency business, you are subject only to the Simplified Approach in paragraph 16 of the TR PD.',
          'If you later begin delivering services through electronic channels, your tier changes and the wider requirements apply.'
        ],
        obligations: [
          { ref: '16', status: 'S', what: 'Simplified Approach',
            detail: 'Tier-4 PSRs are subject to the requirements under paragraph 16 only. That paragraph applies exclusively to Tier-4 PSRs.' }
        ],
        dates: [
          { label: 'Policy issued', value: DATES.trIssued, state: '', cls: '' },
          { label: 'Gap analysis and action plan due', value: DATES.trGap, state: 'Deadline passed', cls: 'past' },
          { label: 'Policy takes effect', value: DATES.trEffective, state: 'Compliance date', cls: 'due' }
        ]
      };
    }

    var tier3 = a.size === 'small';
    var obligations = OBLIGATIONS.tr.map(function (o) {
      return {
        ref: o.ref,
        what: o.what,
        detail: o.detail,
        status: tier3 && o.tier3 ? o.tier3 : o.status
      };
    });

    var summary = [];
    if (tier3) {
      summary.push('You fall under Tier-3: annual transaction value of RM1.5 billion or less, and volume of 7 million or fewer, and not a Tier-4 regulatee.');
      summary.push('For Tier-3 PSRs, paragraphs 9.4, 9.6, 10.37, 10.54(d), 11.3(d), 11.8, 11.9(a), 11.15, 11.16 and 12.8(a) and their corresponding appendices are treated as guidance rather than enforceable standards. Everything else in the TR PD applies as a standard.');
    } else {
      summary.push('You fall under Tier-2: annual transaction value above RM1.5 billion or volume above 7 million, and not a Tier-4 regulatee. The full TR PD applies.');
      summary.push('Where group entities operate payment services businesses and share the same technology infrastructure or controls, their transaction value and volume are combined when the threshold is applied.');
    }
    if (a.entity === 'ma') {
      summary.push('As a merchant acquirer, paragraphs 12.6 and 12.8(a) do not apply to you, and Appendix 10 on payment acceptance devices does.');
    }

    return {
      policy: 'Technology Requirements for Payment Services Regulatees',
      tier: tier3 ? 'Tier-3' : 'Tier-2',
      summary: summary,
      obligations: obligations,
      dates: [
        { label: 'Policy issued', value: DATES.trIssued, state: '', cls: '' },
        { label: 'Gap analysis and action plan due', value: DATES.trGap, state: 'Deadline passed', cls: 'past' },
        { label: 'Policy takes effect', value: DATES.trEffective, state: 'Compliance date', cls: 'due' }
      ]
    };
  }

  // ---------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------
  var answers = {};
  var history = [];
  var stepEl, barEl, resultEl;

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function nextQuestion() {
    for (var i = 0; i < QUESTIONS.length; i++) {
      var q = QUESTIONS[i];
      if (answers[q.id] !== undefined) continue;
      if (q.when && !q.when(answers)) continue;
      return q;
    }
    return null;
  }

  function progress() {
    var total = 2;
    var done = history.length;
    return Math.min(100, Math.round((done / (done + (nextQuestion() ? 1 : 0) + 0.001)) * 100)) || (done ? 50 : 0);
  }

  function render() {
    var q = nextQuestion();
    if (!q) { renderResult(); return; }

    barEl.style.width = progress() + '%';
    resultEl.classList.remove('is-active');
    stepEl.classList.add('is-active');

    var opts = q.options.map(function (o) {
      return '<button class="chk-opt" type="button" data-value="' + esc(o.value) + '">' +
        '<span class="chk-opt__mark" aria-hidden="true"></span>' +
        '<span class="chk-opt__label">' + esc(o.label) +
        (o.note ? '<span class="chk-opt__note">' + esc(o.note) + '</span>' : '') +
        '</span></button>';
    }).join('');

    stepEl.innerHTML =
      '<p class="chk-step__count">Question ' + (history.length + 1) + '</p>' +
      '<h2 class="chk-step__q">' + esc(q.q) + '</h2>' +
      '<p class="chk-step__help">' + esc(q.help) + '</p>' +
      '<div class="chk-options">' + opts + '</div>' +
      (history.length ? '<button class="chk-back" type="button" data-back>&larr; Back</button>' : '');

    var first = stepEl.querySelector('.chk-opt');
    if (first) first.focus();

    stepEl.querySelectorAll('.chk-opt').forEach(function (btn) {
      btn.addEventListener('click', function () {
        answers[q.id] = btn.dataset.value;
        history.push(q.id);
        render();
      });
    });
    var back = stepEl.querySelector('[data-back]');
    if (back) back.addEventListener('click', goBack);
  }

  function goBack() {
    var last = history.pop();
    if (last) delete answers[last];
    render();
  }

  function renderResult() {
    var r = resolve(answers);
    barEl.style.width = '100%';
    stepEl.classList.remove('is-active');
    resultEl.classList.add('is-active');

    var dates = r.dates.map(function (d) {
      return '<div class="chk-date">' +
        '<p class="chk-date__label">' + esc(d.label) + '</p>' +
        '<p class="chk-date__value">' + esc(d.value) + '</p>' +
        (d.state ? '<p class="chk-date__state chk-date__state--' + d.cls + '">' + esc(d.state) + '</p>' : '') +
        '</div>';
    }).join('');

    var rows = r.obligations.map(function (o) {
      return '<div class="chk-row">' +
        '<div class="chk-row__ref">' + esc(o.ref) + '</div>' +
        '<div class="chk-row__what">' + esc(o.what) +
          '<span class="chk-row__detail">' + esc(o.detail) + '</span>' +
          '<span class="chk-tag chk-tag--' + (o.status === 'S' ? 's' : 'g') + '" style="margin-top:8px;">' +
            (o.status === 'S' ? 'STANDARD' : 'GUIDANCE') + '</span>' +
        '</div>' +
        '<div class="chk-row__status"><span class="chk-tag chk-tag--untracked">NOT TRACKED</span></div>' +
        '</div>';
    }).join('');

    var register = r.obligations.length ?
      '<div class="chk-reg__head">' +
        '<h3 class="chk-reg__title">Your recurring testing and evidence obligations</h3>' +
        '<span class="chk-reg__count">' + r.obligations.length + ' of these run on a cycle</span>' +
      '</div>' +
      '<p class="chk-reg__sub">These are the obligations that repeat and have to be evidenced to a supervisor. The status column shows what a register looks like before anything is tracking it.</p>' +
      '<div class="chk-reg">' + rows + '</div>' : '';

    var handoff = r.obligations.length ?
      '<div class="chk-handoff">' +
        '<h3 class="chk-handoff__title">Your action plan is already with BNM</h3>' +
        '<p class="chk-handoff__text">The gap analysis deadline has passed, which means you have submitted an action plan with a timeline and milestones. Send me the detailed obligation checklist for ' +
          esc(r.tier || r.policy) + ', and a sample of the evidence pack ResiliencePro produces after a drill.</p>' +
        '<form class="chk-form" id="chkForm" novalidate>' +
          '<input class="chk-input" type="text" name="name" placeholder="Name" autocomplete="name" required>' +
          '<input class="chk-input" type="text" name="company" placeholder="Organisation" autocomplete="organization" required>' +
          '<input class="chk-input chk-form__full" type="email" name="email" placeholder="Work email" autocomplete="email" required>' +
          '<label class="chk-consent chk-form__full">' +
            '<input type="checkbox" name="consent" required>' +
            '<span>I agree that BlueAura Technology Sdn Bhd may use these details to send the checklist and contact me about ResiliencePro. Details are stored for 24 months and you can ask us to delete them at any time. See our <a href="privacy.html">privacy notice</a>.</span>' +
          '</label>' +
          '<div class="chk-form__full">' +
            '<button class="btn btn--primary btn--lg" type="submit">Send me the checklist</button>' +
            '<p class="chk-msg" id="chkMsg" role="status"></p>' +
          '</div>' +
        '</form>' +
      '</div>' : '';

    resultEl.innerHTML =
      '<div class="chk-verdict">' +
        '<p class="chk-verdict__label">Applies to you</p>' +
        '<p class="chk-verdict__policy">' + esc(r.policy) + '</p>' +
        (r.tier ? '<p class="chk-verdict__tier">' + esc(r.tier) + '</p>' : '') +
        r.summary.map(function (s) { return '<p class="chk-verdict__text">' + esc(s) + '</p>'; }).join('') +
      '</div>' +
      (dates ? '<div class="chk-dates">' + dates + '</div>' : '') +
      register + handoff +
      '<div class="chk-restart"><button class="chk-back" type="button" data-restart>Start again</button></div>';

    var restart = resultEl.querySelector('[data-restart]');
    if (restart) restart.addEventListener('click', function () {
      answers = {}; history = []; render();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    var form = document.getElementById('chkForm');
    if (form) form.addEventListener('submit', function (e) { submitLead(e, form, r); });

    resultEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function submitLead(e, form, result) {
    e.preventDefault();
    var msg = document.getElementById('chkMsg');
    var data = {
      name: form.name.value.trim(),
      company: form.company.value.trim(),
      email: form.email.value.trim(),
      entity: answers.entity,
      policy: result.policy,
      tier: result.tier,
      submittedAt: new Date().toISOString()
    };

    if (!data.name || !data.company || !data.email || !form.consent.checked) {
      msg.className = 'chk-msg chk-msg--error';
      msg.textContent = 'Fill in all three fields and tick the consent box.';
      return;
    }

    if (!LEAD_ENDPOINT) {
      msg.className = 'chk-msg chk-msg--error';
      msg.textContent = 'The form is not connected yet. Email sales@resiliencepro.com.my and we will send the checklist.';
      return;
    }

    var btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    msg.className = 'chk-msg';
    msg.textContent = 'Sending\u2026';

    fetch(LEAD_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    }).then(function (res) {
      if (!res.ok) throw new Error(res.status);
      msg.className = 'chk-msg chk-msg--ok';
      msg.textContent = 'Sent. The checklist is on its way to ' + data.email + '.';
      form.querySelectorAll('input').forEach(function (i) { i.disabled = true; });
    }).catch(function () {
      btn.disabled = false;
      msg.className = 'chk-msg chk-msg--error';
      msg.textContent = 'That did not send. Email sales@resiliencepro.com.my and we will send the checklist.';
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    stepEl = document.getElementById('chkStep');
    barEl = document.getElementById('chkBar');
    resultEl = document.getElementById('chkResult');
    if (stepEl && barEl && resultEl) render();
  });
})();
