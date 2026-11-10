# Initial copy and content contracts

**Version:** 0.3  
**Date:** 2026-11-10  
**Status:** REVIEW DRAFT, PLACEHOLDER COPY  
**Purpose:** Give the implementation a coherent starting voice without inventing commitments.

## 1. Public page

**Headline**

> Turn complicated work into useful systems.

**Supporting copy**

> Software, practical AI and clear communication, with scope, decisions and handoff kept in one place.

**Actions**

| Label | Meaning |
| --- | --- |
| Explore your project | Opens the optional project explorer after the recording notice. |
| Schedule a conversation | Opens scheduling without requiring a completed brief. |
| Client sign in | Opens the verified client login when that destination is ready. |
| Email Velcrafting | Uses the existing public contact address. |
| Save my progress | Starts optional email verification and own-brief resume. |
| Update my brief | Requests one bounded refinement using the current confirmed state. |
| Use this brief for my meeting | Confirms the exact selected revision and recipients for booking context. |
| Download PDF / Download Markdown / Copy brief | Exports the selected snapshot without another model request. |

Keep these labels consistent across desktop, mobile, the generated component catalog and confirmation screens. The model cannot rewrite consent or transactional controls.

## 2. Process examples

Label the panel **Fictional example**. Use a stable invented scenario with no real client's details, revenue, pricing or identifying content.

| Stage | Short panel copy | Example record |
| --- | --- | --- |
| Discovery | We start with the problem, the people involved and what is still unknown. | A fictional team wants a clearer way to review recurring requests. One question remains: who owns the final decision? |
| Quote | When useful, we establish commercial direction before detailing the work. | The example quote identifies a pricing basis and assumptions. Amounts are intentionally omitted. |
| Proposal | We make the work, responsibilities and completion checks concrete. | The proposed deliverable is a reviewed workflow and a bounded prototype. Live rollout is outside this fictional scope. |
| Start | We agree what is ready, who owns each input and what can begin. | The team supplies representative, non-sensitive examples and names a reviewer. |
| Updates | You can see what changed, what comes next and where a decision is needed. | The draft workflow is ready for review. A routing decision is still open. |
| Delivery | The result comes with instructions, ownership and a clear list of remaining items. | The handoff contains the prototype, decision record, usage notes and remaining limitations. |

Supporting line: **The shape of the engagement depends on the work. Some stages combine, and updates follow the cadence we agree.**

Use a second communications example in evaluation and selected UI examples so the page does not imply that every engagement produces an application.

## 3. Before the first AI call

> **Explore your project with AI**  
> Velcrafting records the messages you send and the AI responses, including unfinished conversations, so we can review inquiries, understand usage and improve this experience. Our AI service providers process these messages. Please keep details general and leave out confidential company information, customer records, passwords and personal information about others.  
> **How your information is used**

This is a disclosure of the intended recording behavior, not permission to reuse a visitor's specific information in another client's work. Do not suggest that data is stored only after a brief is completed. Do not promise anonymity, universal zero retention or that a warning prevents sensitive data from being entered.

The linked detail page must explain the actual categories recorded, purposes, restricted staff access, provider route, adopted retention periods, deletion/contact process, booking/export copies and separate reminder consent. It must accurately describe any deployment telemetry. State if raw content is excluded from general analytics and ensure that is true.

Avoid a vague claim that every submission is used to serve future prospective clients. The operational purpose is clearer: review this inquiry, assess usefulness and improve the experience. Publishing stories, training a model or sharing identifiable material with other clients requires a different, deliberately reviewed basis.

## 4. Conversation and brief

**Initial question**

> What would you like to make easier, clearer or possible?

**Understanding**

> Here is what I understand so far. You can change any part of it.

**Uncertainty**

> This is still an open question. We can leave it unresolved for the conversation.

**Scope control explanation**

> These choices help describe the work and its dependencies. Pricing and commitments are confirmed after review.

**Brief footer**

> This is a discussion brief. Scope, pricing and commitments are confirmed after review.

**Partial brief**

> In progress. The brief includes what is known and the questions still to explore.

Avoid promising a result, approval, delivery window or commercial relationship because a model generated a brief. Preserve user-provided constraints as their stated needs, not Velcrafting promises.

## 5. Email capture and reminder consent

> **Save my progress**  
> Enter your email to receive a way to return to this brief. You can keep exploring without saving your email.

Separate unchecked choice, with a recorded wording version:

> Send me one reminder to finish my brief or book a conversation. I can opt out at any time.

**Generic verification result**

> If this request can be completed, a code will arrive shortly. Check the address or request a new code if needed.

**After successful verification**

> Your current brief is saved to this verified address.

Do not display other sessions merely because they used the same unverified email. The code authorizes the verified account; the current session capability establishes which brief can be claimed.

Proposed reminder, disabled until owner review and verified sender setup:

**Subject:** Your Velcrafting brief is ready to pick up

> You asked for one reminder about your project brief. You can return to what you started or schedule a conversation whenever you are ready.  
> **Return to my brief**  
> **Schedule a conversation**  
> Stop reminders about this inquiry.

The resume action requires the appropriate authenticated flow. Do not embed the private brief or raw discussion in the message. Send no repeated sequence and make no claim that a person read the email. Never use this opt-in for the existing newsletter.

## 6. Booking, notes and attachments

**Before scheduling**

> You can book with a partial brief. Review what you want to share with the meeting participants.

**Before confirming the snapshot**

> Use this version for the meeting. Your earlier messages are already recorded under the explorer notice. This shares the selected brief with the named participants.

**No brief selected**

> Continue without a brief. The meeting notes will show that the project context is still to discuss.

**Booking pending**

> We are waiting for the scheduling confirmation. Please avoid starting a second booking while we check.

**Booking confirmed, preparation pending**

> Your booking is confirmed. We are still preparing the brief and notes for the meeting.

**Meeting ready**

> Your meeting is ready. The calendar details include the Google Meet link, the selected brief and a place for notes.

**Meeting ready, no brief supplied**

> Your meeting is ready. The calendar details include the Google Meet link and a place for notes. No brief was supplied.

Use Meeting ready only after the integration has verified the required resources. A scheduling widget success message cannot establish file permissions. An invitation is not an accepted RSVP or proof that the visitor attended.

The prepared notes document contains the meeting purpose, brief/version reference, questions, space for notes, decisions and next actions. It does not imply audio recording, transcription or Google's automatic note-taking is active.

## 7. Recoverable failures

| State | Suggested copy and action |
| --- | --- |
| Model unavailable | The project explorer is unavailable right now. Your existing brief is still here. Export it or schedule a conversation. |
| Usage limit | This exploration has reached its current limit. You can still edit the brief, export it or contact Velcrafting. |
| Durable save failed before dispatch | We could not save this request, so it was not sent for AI processing. Keep your text and try again. |
| Unknown provider outcome | The response was interrupted. We are checking its status before trying again. |
| Invalid generated structure | We could not turn that response into a usable brief update. Your previous version is unchanged. |
| PDF unavailable | The PDF could not be created. Download Markdown or copy the brief while we resolve it. |
| Attachment failure | Your meeting remains booked. Its documents are not ready yet. We will show their status here. |
| Stale revision | This brief changed in another action. Review the latest version before continuing. |

Show only actions that actually work in the deployed environment. Do not say a call was free or unbilled merely because the response failed.

## 8. Private workspace copy

| State | Suggested copy |
| --- | --- |
| Login | Welcome back. Enter your email to continue. |
| No authorized work | There is no shared engagement available to this account. Contact Velcrafting if you expected access. |
| Home | Your work with Velcrafting. |
| Current action | Next action: [specific action and owner]. |
| No client action | No action needed from you. |
| Agreed scope | Current accepted baseline: [proposal version and accepted amendments]. |
| New proposal candidate | A newer proposal is being prepared. The accepted baseline below remains unchanged. |
| Recorded agreement | Agreement evidence recorded for [exact version]. |
| Delivery | Deliverables, operating instructions and outstanding items. |

Avoid “you approved” unless the record and actor actually support it. An internal staff publication, a document open or a meeting attendance is not commercial agreement.
