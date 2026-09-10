import { describe, it, expect } from 'vitest'
import { isBoardSendConfirmation, isHelloWorkOfferGone, isRejectionEmail } from './claude'

describe('isBoardSendConfirmation — job-board "application forwarded" = sent, not reviewing', () => {
  it('matches an Indeed send confirmation', () => {
    expect(isBoardSendConfirmation({
      from: 'noreply@indeed.com',
      subject: 'Candidature envoyée',
      body: 'Les éléments suivants ont été envoyés à Hublo. Bonne chance !',
    })).toBe(true)
  })

  it('matches a LinkedIn "your application was sent" confirmation', () => {
    expect(isBoardSendConfirmation({
      from: 'jobs-noreply@linkedin.com',
      subject: 'Your application was sent to Acme',
      body: 'Your application was sent to Acme Corp.',
    })).toBe(true)
  })

  it('does NOT match an employer/ATS receipt acknowledgement (that legitimately means reviewing)', () => {
    expect(isBoardSendConfirmation({
      from: 'no-reply@greenhouse.io',
      subject: 'Thank you for applying',
      body: 'We have received your application and will review it.',
    })).toBe(false)
  })

  it('does NOT match a job-board alert that lacks a send phrase', () => {
    expect(isBoardSendConfirmation({
      from: 'noreply@indeed.com',
      subject: 'New jobs matching your profile',
      body: 'Here are jobs you might like.',
    })).toBe(false)
  })
})

describe('isHelloWorkOfferGone — withdrawn HelloWork posting = rejected', () => {
  it('matches the "offre n\'est plus disponible" questionnaire', () => {
    expect(isHelloWorkOfferGone({
      from: 'emploi@emails.hellowork.com',
      subject: "L'offre de Product Delivery Manager H/F n'est plus disponible",
      body: "L'offre n'est plus disponible sur notre site. Avez-vous été recruté pour ce poste ?",
    })).toBe(true)
  })

  it('does NOT match a normal HelloWork response email', () => {
    expect(isHelloWorkOfferGone({
      from: 'emploi@emails.hellowork.com',
      subject: 'Réponse reçue de l\'entreprise',
      body: 'Le recruteur souhaite vous rencontrer.',
    })).toBe(false)
  })

  it('does NOT fire the generic phrasing for a non-HelloWork sender', () => {
    expect(isHelloWorkOfferGone({
      from: 'noreply@indeed.com',
      subject: 'Cette offre no longer available',
      body: 'no longer available',
    })).toBe(false)
  })
})

describe('isRejectionEmail — an explicit "no" survives a polite ATS wrapper', () => {
  it('matches the Ashby "move forward with other candidates" letter', () => {
    expect(isRejectionEmail({
      from: 'no-reply@ashbyhq.com',
      subject: 'Thanks for your interest in Checkout.com',
      body: 'Thank you for your interest in our Project Manager - Integrations position. '
        + 'Despite the quality of your profile, we have made the decision to move forward '
        + "with other candidates at this time. In the next few days you'll receive an email "
        + 'to tell us about your experience — we would appreciate it if you completed the survey.',
    })).toBe(true)
  })

  it('matches a French "candidature non retenue"', () => {
    expect(isRejectionEmail({
      subject: 'Votre candidature',
      body: "Nous avons le regret de vous informer que votre candidature n'a pas été retenue.",
    })).toBe(true)
  })

  it('does NOT match a genuine application acknowledgement', () => {
    expect(isRejectionEmail({
      from: 'no-reply@greenhouse.io',
      subject: 'Thank you for applying',
      body: 'We have received your application and will review it shortly.',
    })).toBe(false)
  })

  it('does NOT match an interview invitation that says "move forward with your application"', () => {
    expect(isRejectionEmail({
      subject: 'Next steps',
      body: "We'd love to move forward with your application and set up an interview.",
    })).toBe(false)
  })
})
