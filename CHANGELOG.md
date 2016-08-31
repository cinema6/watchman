# Watchman

## v1.7.1 (August 31, 2016)
* *[v1.7.1-rc1]*
  * [FIX]: Only warn about an org's `nextPaymentPlanId` if they should
    be billed
* *[/v1.7.1-rc1]*

## v1.7.0 (August 18, 2016)
* *[v1.7.0-rc3]*
  * [FEATURE]: Support email notification on payment plan upgrade
  * [FEATURE]: Support email notification on payment plan downgrade request
  * [FEATURE]: Support email notification on payment plan cancel request
  * [FIX]: Round beeswax campaign impressions when increasing a
    campaign's budget.
  * [FIX]: Fail with a better error message if a beeswax campaign can't
    be found.
  * **Extra Deployment Steps**:
    * Update environment with new payment plan emailing actions
* *[/v1.7.0-rc3]*

* *[v1.7.0-rc2]*
  * [FEATURE]: Include payment plan information in showcase payment receipts
  * [FIX]: Handle advertisers with the same name [159] (https://github.com/cinema6/watchman/issues/159)
  * [FIX]: Do not decrease beeswax campaign budgets [160] (https://github.com/cinema6/watchman/issues/160)
  * [FIX]: Stop watchman from re-activating archived campaigns when a
    payment is made
  * **Extra Deployment Steps**:
    * Update environment with extra payment receipt email config
* *[/v1.7.0-rc2]*

* *[v1.7.0-rc1]*
  * [FEATURE]: Added the ability to reactivate campaigns in beeswax
  * [FEATURE]: Added the ability for weekly stats emails to include stats for multiple apps
  * [FEATURE]: Added the ability to transition payment plans for an org
  * [FEATURE]: Start a user's new payment plan immediately upon
    upgrading
  * [FEATURE]: Added updating of lineItems to upsertCampaignActiveLineItems
  * [FEATURE]: Add support for bonus view promotions
  * [FEATURE]: Automatically archive the user's oldest campaigns when
    their subscription is downgraded
  * [FIX]: Ensure we don't try to charge a user for a subscription of $0
  * **Extra Deployment Steps**:
    * Update environment with `reactivate_campaign` action
    * Update postmark template config with new weekly stats templates
    * Deploy new postmark weekly stats templates
    * Update environment with `transition_payment_plans` action
    * Update environment with `check_plan_upgrade` action
    * Configure `showcase/apps/auto_increase_budget` to only run for
      transactions with a `paymentPlanId` property
    * Update environment with `showcase/apps/rebalance` action
    * Update environment with `fulfill_bonus_views` action
    * Update environment with `showcase/apps/auto_archive_campaigns` action
* *[/v1.7.0-rc1]*

## v1.6.1 (August 23, 2016)
* *[v1.6.1-rc1]*
  * [FIX]: Update creative creation to account for Beeswax's breaking
    API change
* *[/v1.6.1-rc1]*

## v1.6.0 (August 11, 2016)
* *[v1.6.0-rc1]*
  * [FEATURE]: Added the ability to add payment plan information to HubSpot
* *[v1.6.0-rc1]*

## v1.5.0 (August 8, 2016)
* *[v1.5.0-rc5]*
  * [FIX]: Pass beeswax.templates config into beeswaxhelper midware.
* *[/v1.5.0-rc5]*
* *[v1.5.0-rc4]*
  * [FIX]: Fixed bug in cwrx.campaignStateChange e2e.
* *[/v1.5.0-rc4]*
* *[v1.5.0-rc3]*
  * [FIX]: Line items will use creatives associated with a campaign (placement) not all
    creatives associated with an advertiser.  Fixes bug if changing apps in SSB.
* *[/v1.5.0-rc3]*
* *[v1.5.0-rc2]*
  * [FEATURE]: Only send weekly stats emails to orgs with a current payment
  * [FIX]: Line items will use today as start_date when created to avoid a mismatch on the campaign start date..
* *[/v1.5.0-rc2]*

* *[v1.5.0-rc1]*
  * [FEATURE]: Added campaign budget adjustment func to beeswax middleware
  * [FEATURE]: Added upsert method to create (and eventually update) line items.
  * [FIX]: Fix e2e tests to work with ad service that does not integrate with beeswax.
  * [DEV]: Added BeeswaxHelper for e2e tests that work with beeswax.
  * [DEV]: Added grunt beeswax:clean task to cleanup lingering test advertisers.
  * [FIX]: Fix for an issue that would cause fetching the product data for some apps to fail
* *[/v1.5.0-rc1]*

## v1.4.1 (July 29, 2016)
* *[v1.4.1-rc1]*
  * [FIX]: Fix for an issue that would cause too many HubSpot requests to be sent and rate limited
* *[/v1.4.1-rc1]*

## v1.4.0 (July 21, 2016)
* *[v1.4.0-rc1]*
  * Change the schema of free trial promotions
  * [FEATURE]: Add support for bonus-view promotion transactions
  * **Extra Deployment Steps**:
    * Update `freeTrial` promotions to be keyed by payment plan ids
  * [FIX]: Use product.websites for setting advertiser_domain in beeswax creatives
* *[/v1.4.0-rc1]*

## v1.3.0 (July 18, 2016)
* *[v1.3.0-rc2]*
  * [FIX]: Fix for an issue where a view milestone may be calculated incorrectly
* *[/v1.3.0-rc2]*

* *[v1.3.0-rc1]*
  * [FEATURE]: Add the ability to detect view count milestones for campaigns
  * [DESIGN]: Update logo for showcase emails
  * [FEATURE]: Added BeeswaxMiddleware lib module for workign with Beeswax API
  * [FIX]: showplace/apps/init_campaign creates placments using the ext=false param to prevent auto creation of beeswax placements for showplace apps.
  * [FIX]: init_campaign uses BeeswaxMiddleware to create beeswax advertiser,campaign, and creatives
  * [FIX]: removed 300x250 card / placement from init_campaigns.
  * [FIX]: Updated code to expect more consistent property scheme for finding beeswax ids on c6 entities.. (<entity>.externalIds.beeswax).
  * Change the logic for allocating funds/impressions to showcase
    campaigns
  * [FEATURE]: Reallocate funds/impressions when a showcase campaign is
    added/removed
  * All dependencies on the cwrx-beeswax integration have been removed
  * ** Extra Deployment Steps**:
    * Add check_views_milestone action to morning_orgPulse handler
    * Add hubspot/update_user action to views_milestone handler
    * Need to add tracking property to cwrx.api config (see environments/development.json)
    * Update watchman environments
    * Ensure watchman app can:
      * Read all transactions
      * Do whatever it wants with `campaign.pricing`
* *[/v1.3.0-rc1]*

## v1.2.0 (July 12, 2016)
* *[v1.2.0-rc3]*
  * [FIX]: Do not query for deleted campaigns
* *[/v1.2.0-rc3]*

* *[v1.2.0-rc2]*
  * [FIX]: Allow sending weekly stats for any non-canceled campaign
* *[/v1.2.0-rc2]*

* *[v1.2.0-rc1]*
  * [DEV]: Add e2e configurator
  * [FEATURE]: Weekly stats emails
  * [FEATURE]: Deactivate line items and campaigns in beeswax when a
    showcase (apps) campaign is canceled
  * Change the format of the transactions/payments created for showcase
  * ** Extra Deployment Steps**:
    * Deploy c6env cookbook `v2.18.0`
    * Deploy postmark email template
    * Deploy watchman cookbook `v2.2.0`
    * Update watchman environments
    * Update querybot to not rely on transaction descriptions: [#970](https://github.com/cinema6/cwrx/issues/970)
* *[/v1.2.0-rc1]*

## v1.1.0 (June 30, 2016)
* *[v1.1.0-rc1]*
  * [FEATURE]: Indicate paying customers in Hubspot
  * [DEV]: Replace jshint with eslint
* *[/v1.1.0-rc1]*

## v1.0.0 (June 27, 2016)
* *[v1.0.0-rc2]*
  * [FIX]: Use Node v4.4.7
* *[/v1.0.0-rc2]*

* *[v1.0.0-rc1]*
  * Switch to use Node v4.4.6 for Watchman (ES6 Features)
  * ** Extra Deployment Steps**:
    * Deploy c6env cookbook v2.17.0
    * Deploy watchman cookbook v2.0.0
* *[/v1.0.0-rc1]*

## v0.13.0 (June 21, 2016)
* *[v0.13.0-rc1]*
  * [FEATURE]: Add support for sending promotionEnded emails for showcase users
  * ** Extra Deployment Steps**:
    * Update environments
    * Update lambda function to produce tenMinutes event
    * Add lambda function to produce hourly events with the hour in data
    * Remove daily lambda function
    * Promote promotionEnded template in Postmark
* *[/v0.13.0-rc1]*

## v0.12.0 (June 17, 2016)
* *[v0.12.0-rc2]*
  * [FIX]: Improve the reliability of deployments and the nightly build
* *[/v0.12.0-rc2]*

* *[v0.12.0-rc1]*
  * [FEATURE]: Add `nextPaymentDate` property to orgs with payment plans
  * [FEATURE]: Revamp `check_available_funds` action to fetch orgs itself, and batch requests to `/api/accounting/balances`
  * ** Extra Deployment Steps**:
    * Update environment so that `check_available_funds` runs on `hourly` event from time stream, and not on `hourly_orgPulse` from watchman stream
* *[/v0.12.0-rc1]*

## v0.11.0 (June 13, 2016)
* *[v0.11.0-rc1]*
  * [FEATURE]: Add the ability to update users in Hubspot
  * Improve emailChanged event to make it intended to only be fired once when a user's email is changed
  * ** Extra Deployment Steps**:
    * Deploy new version of userSvc
    * Deploy new watchman cookbook
* *[/v0.11.0-rc1]*

## v0.10.0 (June 10, 2016)
* *[v0.10.0-rc2]*
  * [FIX]: Fix for an issue that caused initializedShowcaseCampaign emails to support to not contain the proper images
* *[/v0.10.0-rc2]*

* *[v0.10.0-rc1]*
  * [FEATURE]: Add support for sending campaignActive emails for showcase users
* *[/v0.10.0-rc1]*

## v0.9.0 (June 9, 2016)
* *[v0.9.0-rc1]*
  * [FEATURE]: Add action for submitting forms in Hubspot
* *[/v0.9.0-rc1]*

## v0.8.0 (June 7, 2016)
* *[v0.8.0-rc1]*
  * [FIX]: Make sure funds are only allocated to a showcase campaign
    when funds are added for showcase promotions or subscription
    payments
  * Change logic for funding external campaigns
  * ** Extra Deployment Steps**:
    * Deploy new version of the org service with the ability to
      set the transaction description when making payments
    * Deploy new version of ad service that supports setting number of
      impressions on external campaigns
    * Update watchman environments
* *[/v0.8.0-rc1]*

## v0.7.0 (June 1, 2016)
* *[v0.7.0-rc1]*
  * [FEATURE]: Support sending emails through Postmark
* *[/v0.7.0-rc1]*

## v0.6.0 (May 25, 2016)
* *[v0.6.0-rc4]*
  * [FIX]: Handle showcase campaigns without a pricing hash, but really
    this time
* *[/v0.6.0-rc4]*

* *[v0.6.0-rc3]*
  * [FIX]: Ensure showcase users can edit their campaigns after their
    cards have been created
* *[/v0.6.0-rc3]*

* *[v0.6.0-rc2]*
  * [FIX]: Make sure the `fetch_orgs` action completes and does not
    block further actions
  * [FIX]: Handle showcase campaigns without a pricing hash
* *[/v0.6.0-rc2]*

* *[v0.6.0-rc1]*
  * [FIX]: Fix for an issue where an error from within an action could unnecessarily propagate
  * [FEATURE]: Add the action to generate creatives and placements for a
    showcase user
  * Increase the budget of beeswax campaigns when showcase users' credit
    cards are charged
  * ** Extra Deployment Steps**:
    * Update watchman app priveleges to allow it to create placements
      and get all advertisers
    * Update environments with new configuration
* *[/v0.6.0-rc1]*

## v0.5.0 (May 17, 2016)
* *[v0.5.0-rc2]*
  * [FIX]: Fix for an issue that prevented showcase failed logins emails from using the proper showcase link
* *[/v0.5.0-rc2]*

* *[v0.5.0-rc1]*
  * [FEATURE]: Add email templates for showcase
  * [FIX]: Fix for an issue that prevented configuration from being dynamically reloaded
  * [FIX]: Fix for an issue that prevented the expiration of campaigns with a pending update request
  * [FEATURE]: Increase the budget of showcase campaigns when their org
    gets more funds
  * **Extra Deployment Steps**:
    * Update watchman app privileges to allow rejecting update requests
    * Update watchman environments to include showcase targets for emailing
    * Ensure Cwrx passes target for showcase emails
* *[/v0.5.0-rc1]*

## v0.4.0 (April 27, 2016)
* *[v0.4.0-rc2]*
  * [FIX]: Fix for an issue where an email template link was incorrect
* *[/v0.4.0-rc2]*

* *[v0.4.0-rc1]*
  * [FEATURE]: Add support for free trial promotions
  * [FEATURE]: Add email template for when Campagin is Active
  * [FEATURE]: Add email template for when Campaign is Submitted  
  * Updated email templates for Welcome/Activate, Account is Active
* *[/v0.4.0-rc1]*

## v0.3.1 (April 18, 2016)
* *[v0.3.1-rc1]*
  * Update payment receipt email template
* *[/v0.3.1-rc1]*

## v0.3.0 (April 18, 2016)
* *[v0.3.0-rc1]*
  * Allow conditionally performing actions based on nested properties in an event's data
  * Make logging CloudWatch reporting for actions more manageable
  * [FEATURE]: Added the ability to configure a log action in response to events
  * [FEATURE]: Added the ability to check_available_funds for campaigns
  * [DEV]: Download dependencies using curl instead of wget
* *[/v0.3.0-rc1]*

## v0.2.1 (April 13, 2016)
* *[v0.2.1-rc1]*
  * Set `created`, `lastUpdated`, and `status` on `promotions` entries in `check_signup_promotion` action
* *[/v0.2.1-rc1]*

## v0.2.0 (April 11, 2016)
* *[v0.2.0-rc1]*
  * [FEATURE]: Added functionality to campaign_email action to send receipt emails for `paymentMade` event
  * [FEATURE]: Add `create_promotion_credit` and `check_signup_promotion` actions
  * [DEV]: Refactor the action API
  * [FEATURE]: Add logic to bill orgs with payment plans every month
  * **Extra Deployment Steps**:
    * Update environments to include new configuration
    * Update the watchman app's privileges to include the ability to
      * Read all orgs
      * makePaymentForAny
* *[/v0.2.0-rc1]*

## v0.1.0 (April 4, 2016)
* *[v0.1.0-rc1]*
  * [FIX]: Fix for an issue where some campaigns may fail to be fetched
  * [DEV]: Support simultaneous development and testing on streams
  * Improved failure messages for some actions
  * Use rc-kinesis in place of JsonProducer
  * [FEATURE]: Added campaign_email action to send out emails about campaign events
  * Add support for slideshow bob account creations emails
* *[/v0.1.0-rc1]*

## v0.0.2 (March 22, 2016)
* *[v0.0.2-rc1]*
  * Improved shutdown behavior for when a worker becomes a zombie or terminates
  * Fix for an issue where multiple instances of a given KCL application would not be able to start
* *[/v0.0.2-rc1]*

## v0.0.1 (March 7, 2016)
* *[v0.0.1-rc2]*
  * [FIX]: Fix for an issue that could cause watchman to silently fail if a java worker process was lost
  * [FEATURE]: Allow fetch_campaigns to request campaigns in chunks of specified size
  * Log more detailed warnings when a request fails
  * Log the successful completion of actions at the trace level
* *[/v0.0.1-rc2]*

* *[v0.0.1-rc1]*
  * Initial release of Watchman
* *[/v0.0.1-rc1]*
