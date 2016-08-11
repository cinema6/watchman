'use strict';

const Configurator = require('../helpers/Configurator.js');
const Hubspot = require('../../lib/Hubspot.js');
const enums = require('cwrx/lib/enums.js');
const ld = require('lodash');
const rcKinesis = require('rc-kinesis');
const rcUuid = require('rc-uuid');
const testUtils = require('cwrx/test/e2e/testUtils.js');
const waiter = require('../helpers/waiter.js');

const API_ROOT = process.env.apiRoot;
const APP_CREDS = JSON.parse(process.env.appCreds);
const AWS_CREDS = JSON.parse(process.env.awsCreds);
const CWRX_STREAM = process.env.cwrxStream;
const PREFIX = process.env.appPrefix;
const SECRETS = JSON.parse(process.env.secrets);
const WATCHMAN_STREAM = process.env.watchmanStream;
const HUBSPOT_API_KEY = SECRETS.hubspot.key;

describe('HubSpot integration', function() {
    // This beforeAll is dedicated to setting application config
    beforeAll(function(done) {
        const configurator = new Configurator();
        const sharedConfig = {
            secrets: '/opt/sixxy/.watchman.secrets.json',
            appCreds: '/opt/sixxy/.rcAppCreds.json',
            cwrx: {
                api: {
                    root: API_ROOT,
                    users: {
                        endpoint: '/api/account/users'
                    },
                    campaigns: {
                        endpoint: '/api/campaigns'
                    },
                    analytics: {
                        endpoint: '/api/analytics'
                    },
                    paymentPlans: {
                        endpoint: '/api/payment-plans'
                    }
                }
            },
            emails: {
            },
            postmark: {
                templates: { }
            }
        };
        const cwrxConfig = {
            eventHandlers: {
                paymentMade: {
                    actions: [
                        {
                            name: 'hubspot/update_user',
                            options: {
                                properties: {
                                    applications: 'apps',
                                    paying_customer: 'true',
                                    e2e: 'true'
                                }
                            },
                            ifData: {
                                target: '^showcase$'
                            }
                        }
                    ]
                },
                accountCreated: {
                    actions: [
                        {
                            name: 'hubspot/submit_form',
                            options: {
                                portal: '2041560',
                                form: '73472e84-6426-4fab-b092-936c0f692da6',
                                data: {
                                    applications: 'apps',
                                    lifecyclestage: 'salesqualifiedlead',
                                    e2e: 'true'
                                }
                            },
                            ifData: {
                                target: '^showcase$'
                            }
                        }
                    ]
                },
                accountActivated: {
                    actions: [
                        {
                            name: 'hubspot/update_user',
                            options: {
                                properties: {
                                    applications: 'apps',
                                    lifecyclestage: 'opportunity',
                                    e2e: 'true'
                                }
                            },
                            ifData: {
                                target: '^showcase$'
                            }
                        }
                    ]
                },
                emailChanged: {
                    actions: [
                        {
                            name: 'hubspot/update_user',
                            options: {
                                properties: {
                                    e2e: 'true'
                                }
                            },
                            ifData: {
                                target: '^showcase$'
                            }
                        }
                    ]
                },
                paymentPlanChanged: {
                    actions: [
                        {
                            name: 'hubspot/update_user',
                            options: {
                                properties: {
                                    applications: 'apps',
                                    e2e: 'true'
                                }
                            }
                        }
                    ]
                }
            }
        };
        const timeConfig = {
            eventHandlers: { }
        };
        const watchmanConfig = {
            eventHandlers: {
                initializedShowcaseCampaign: {
                    actions: [
                        {
                            name: 'hubspot/update_user',
                            options: {
                                properties: {
                                    applications: 'apps',
                                    lifecyclestage: 'customer',
                                    e2e: 'true'
                                }
                            }
                        }
                    ]
                },
                morning_orgPulse: {
                    actions: [
                        {
                            name: 'check_views_milestone',
                            options: {
                                milestones: [100,200,300]
                            }
                        }
                    ]
                },
                views_milestone: {
                    actions: [
                        {
                            name: 'hubspot/update_user',
                            options: {
                                properties: {
                                    applications: 'apps',
                                    views_milestone: '{{milestone}}',
                                    e2e: 'true'
                                }
                            }
                        }
                    ]
                }
            }
        };
        Promise.all([
            configurator.updateConfig(`${PREFIX}CwrxStreamApplication`, sharedConfig, cwrxConfig),
            configurator.updateConfig(`${PREFIX}TimeStreamApplication`, sharedConfig, timeConfig),
            configurator.updateConfig(`${PREFIX}WatchmanStreamApplication`, sharedConfig, watchmanConfig)
        ]).then(done, done.fail);
    });

    // Create a mock watchman app
    beforeAll(function(done) {
        const watchmanApp = {
            id: 'watchman-app',
            key: APP_CREDS.key,
            status: 'active',
            secret: APP_CREDS.secret,
            permissions: {
                campaigns: { read: 'all' },
                cards: { read: 'all' },
                users: { read: 'all' }
            },
            entitlements: { },
            fieldValidation: { }
        };
        testUtils.resetCollection('applications', [watchmanApp]).then(done, done.fail);
    });

    beforeAll(function() {
        const awsConfig = ld.assign({ region: 'us-east-1' }, AWS_CREDS || { });
        jasmine.DEFAULT_TIMEOUT_INTERVAL = 240000;
        this.hubspot = new Hubspot(HUBSPOT_API_KEY);
        this.producers = {
            cwrx: new rcKinesis.JsonProducer(CWRX_STREAM, awsConfig),
            watchman: new rcKinesis.JsonProducer(WATCHMAN_STREAM, awsConfig)
        };
        this.waitForHubspotContact = (email, properties) => waiter.waitFor(() =>
            this.hubspot.getContactByEmail(email).then(contact =>
                contact && ld.reduce(properties, (result, value, key) => {
                    const prop = contact.properties[key];
                    return prop && prop.value === value;
                }, true) ? contact : false
            ), 3000);
    });

    beforeEach(function() {
        this.user = {
            id: `u-${rcUuid.createUuid()}`,
            email: `e2e-${rcUuid.createUuid().toLowerCase()}@reelcontent.com`,
            firstName: 'Johnny',
            lastName: 'Testmonkey'
        };
    });

    afterEach(function(done) {
        this.hubspot.getContactByEmail(this.user.email).then(contact =>
            contact ? this.hubspot.deleteContact(contact.vid): undefined
        ).then(done, done.fail);
    });

    describe('updating a HubSpot contact to be a customer', function() {
        it('should occur when a showcase campaign has been initialized', function(done) {
            this.producers.watchman.produce({
                type: 'initializedShowcaseCampaign',
                data: {
                    user: this.user
                }
            }).then(() => this.waitForHubspotContact(this.user.email, {
                email: this.user.email
            })).then(contact => {
                expect(contact.properties.email.value).toBe(this.user.email);
                expect(contact.properties.firstname.value).toBe(this.user.firstName);
                expect(contact.properties.lastname.value).toBe(this.user.lastName);
                expect(contact.properties.applications.value).toBe('apps');
                expect(contact.properties.lifecyclestage.value).toBe('customer');
            }).then(done, done.fail);
        });
    });

    describe('updating a HubSpot contact to be a paying customer', function() {
        it('should occur when a payment is made', function(done) {
            this.producers.cwrx.produce({
                type: 'paymentMade',
                data: {
                    user: this.user,
                    target: 'showcase'
                }
            }).then(() => this.waitForHubspotContact(this.user.email, {
                email: this.user.email
            })).then(contact => {
                expect(contact.properties.email.value).toBe(this.user.email);
                expect(contact.properties.firstname.value).toBe(this.user.firstName);
                expect(contact.properties.lastname.value).toBe(this.user.lastName);
                expect(contact.properties.applications.value).toBe('apps');
                expect(contact.properties.lifecyclestage.value).toBe('subscriber');
                expect(contact.properties.paying_customer.value).toBe('true');
            }).then(done, done.fail);
        });
    });

    describe('capturing a showcase user as a sales qualified lead in HubSpot', function() {
        it('should occur when an account is created', function(done) {
            this.producers.cwrx.produce({
                type: 'accountCreated',
                data: {
                    user: this.user,
                    target: 'showcase'
                }
            }).then(() => this.waitForHubspotContact(this.user.email, {
                email: this.user.email,
                lifecyclestage: 'salesqualifiedlead',
                num_conversion_events: '1'
            })).then(contact => {
                expect(contact.properties.email.value).toBe(this.user.email);
                expect(contact.properties.firstname.value).toBe(this.user.firstName);
                expect(contact.properties.lastname.value).toBe(this.user.lastName);
                expect(contact.properties.applications.value).toBe('apps');
                expect(contact.properties.lifecyclestage.value).toBe('salesqualifiedlead');
            }).then(done, done.fail);
        });
    });

    describe('updating a HubSpot contact to be an opportunity', function() {
        it('should happen when the user account is activated', function(done) {
            this.hubspot.createContact({
                properties: [
                    {
                        property: 'email',
                        value: this.user.email
                    },
                    {
                        property: 'firstname',
                        value: this.user.firstName
                    },
                    {
                        property: 'lastname',
                        value: this.user.lastName
                    },
                    {
                        property: 'applications',
                        value: 'apps'
                    },
                    {
                        property: 'lifecyclestage',
                        value: 'salesqualifiedlead'
                    }
                ]
            }).then(() => this.producers.cwrx.produce({
                type: 'accountActivated',
                data: {
                    user: this.user,
                    target: 'showcase'
                }
            })).then(() => this.waitForHubspotContact(this.user.email, {
                email: this.user.email,
                lifecyclestage: 'opportunity'
            })).then(contact => {
                expect(contact.properties.email.value).toBe(this.user.email);
                expect(contact.properties.firstname.value).toBe(this.user.firstName);
                expect(contact.properties.lastname.value).toBe(this.user.lastName);
                expect(contact.properties.applications.value).toBe('apps');
                expect(contact.properties.lifecyclestage.value).toBe('opportunity');
            }).then(done, done.fail);
        });

        it('should create a contact if one does not already exist', function(done) {
            this.producers.cwrx.produce({
                type: 'accountActivated',
                data: {
                    user: this.user,
                    target: 'showcase'
                }
            }).then(() => this.waitForHubspotContact(this.user.email, {
                email: this.user.email
            })).then(contact => {
                expect(contact.properties.email.value).toBe(this.user.email);
                expect(contact.properties.firstname.value).toBe(this.user.firstName);
                expect(contact.properties.lastname.value).toBe(this.user.lastName);
                expect(contact.properties.applications.value).toBe('apps');
                expect(contact.properties.lifecyclestage.value).toBe('opportunity');
            }).then(done, done.fail);
        });
    });

    describe('updating a contact email in HubSpot', function() {
        it('should occur when the user changes their email', function(done) {
            const oldEmail = this.user.email;
            this.user.email = `e2e-${rcUuid.createUuid().toLowerCase()}@reelcontent.com`;
            this.hubspot.createContact({
                properties: [
                    {
                        property: 'email',
                        value: oldEmail
                    },
                    {
                        property: 'firstname',
                        value: this.user.firstName
                    },
                    {
                        property: 'lastname',
                        value: this.user.lastName
                    },
                    {
                        property: 'applications',
                        value: 'apps'
                    },
                    {
                        property: 'lifecyclestage',
                        value: 'salesqualifiedlead'
                    }
                ]
            }).then(() => this.producers.cwrx.produce({
                type: 'emailChanged',
                data: {
                    user: this.user,
                    oldEmail: oldEmail,
                    newEmail: this.user.email,
                    target: 'showcase'
                }
            })).then(() => this.waitForHubspotContact(this.user.email, {
                email: this.user.email
            })).then(contact => {
                expect(contact.properties.email.value).toBe(this.user.email);
                expect(contact.properties.firstname.value).toBe(this.user.firstName);
                expect(contact.properties.lastname.value).toBe(this.user.lastName);
                expect(contact.properties.applications.value).toBe('apps');
                expect(contact.properties.lifecyclestage.value).toBe('salesqualifiedlead');
            }).then(done, done.fail);
        });
    });

    describe('updating the views milestone on a HubSpot contact', function() {
        beforeEach(function(done) {
            const campaignId = `cam-${rcUuid.createUuid()}`;
            const orgId = `o-${rcUuid.createUuid()}`;
            const today = offset => {
                const dt = new Date(((new Date()).toISOString()).substr(0,10) + 'T00:00:00.000Z');
                return (new Date(dt.valueOf() + (86400000 * (offset || 0)))).toISOString().substr(0,10);
            };
            this.campaign = {
                id: campaignId,
                org: orgId,
                user: this.user.id,
                status: enums.Status.Active,
                application: 'showcase'
            };
            this.updateCampaign = () => {
                return testUtils.resetCollection('campaigns', [this.campaign]);
            };
            this.updateViews = views => {
                this.campaign.id = `cam-${rcUuid.createUuid()}`;
                return this.updateCampaign().then(() => {
                    return Promise.all([
                        testUtils.resetPGTable('rpt.unique_user_views', [
                            `(\'${this.campaign.id}\',${views},\'${today(-2)}\',\'${today(-1)}\')`
                        ])
                    ]);
                });
            };
            this.produceEvent = () => {
                return this.producers.watchman.produce({
                    type: 'morning_orgPulse',
                    data: {
                        org: {
                            id: this.campaign.org
                        }
                    }
                });
            };
            Promise.all([
                this.updateViews(123),
                testUtils.resetCollection('users', [this.user])
            ]).then(done, done.fail);
        });

        it('should be able to set the view milestone for the first time', function(done) {
            this.produceEvent().then(() =>
                this.waitForHubspotContact(this.user.email, {
                    email: this.user.email
                })
            ).then(contact => {
                expect(contact.properties.email.value).toBe(this.user.email);
                expect(contact.properties.firstname.value).toBe(this.user.firstName);
                expect(contact.properties.lastname.value).toBe(this.user.lastName);
                expect(contact.properties.applications.value).toBe('apps');
                expect(contact.properties.lifecyclestage.value).toBe('subscriber');
                expect(contact.properties.views_milestone.value).toBe('100');
            }).then(done, done.fail);
        });

        it('should be able to update the view milestone', function(done) {
            this.produceEvent().then(() =>
                this.waitForHubspotContact(this.user.email, {
                    email: this.user.email,
                    views_milestone: '100'
                })
            ).then(() => this.updateViews(234)).then(() => this.produceEvent()).then(() =>
                this.waitForHubspotContact(this.user.email, {
                    email: this.user.email,
                    views_milestone: '200'
                })
            ).then(contact => {
                expect(contact.properties.email.value).toBe(this.user.email);
                expect(contact.properties.firstname.value).toBe(this.user.firstName);
                expect(contact.properties.lastname.value).toBe(this.user.lastName);
                expect(contact.properties.applications.value).toBe('apps');
                expect(contact.properties.lifecyclestage.value).toBe('subscriber');
                expect(contact.properties.views_milestone.value).toBe('200');
            }).then(done, done.fail);
        });

        it('should not update the view milestone for a canceled campaign', function(done) {
            this.campaign.status = enums.Status.Canceled;
            this.updateCampaign().then(() => this.produceEvent()).then(() => {
                return Promise.race([
                    this.waitForHubspotContact(this.user.email, {
                        email: this.user.email
                    }),
                    waiter.delay(5000).then(() => 'delay')
                ]);
            }).then(value => {
                return (value === 'delay') ? Promise.resolve() :
                    Promise.reject(new Error('should not have created HubSpot contact'));
            }).then(done, done.fail);
        });
    });

    it('should be able to update the payment plan property', function (done) {
        const orgId = `o-${rcUuid.createUuid()}`;
        const paymentPlanId = `pp-${rcUuid.createUuid()}`;

        const org = {
            id: orgId,
            status: 'active',
            name: 'orgAnic',
            paymentPlanId: paymentPlanId
        };
        const paymentPlan = {
            id: paymentPlanId,
            status: 'active',
            label: 'Business'
        };
        this.user.org = orgId;

        Promise.all([
            testUtils.resetCollection('paymentPlans', [paymentPlan]),
            testUtils.resetCollection('users', [this.user])
        ]).then(() => {
            return this.producers.cwrx.produce({
                type: 'paymentPlanChanged',
                data: {
                    org: org,
                    currentPaymentPlanId: paymentPlanId
                }
            });
        }).then(() => {
            return this.waitForHubspotContact(this.user.email, {
                email: this.user.email,
                payment_plan: 'Business'
            });
        }).then(contact => {
            expect(contact.properties.email.value).toBe(this.user.email);
            expect(contact.properties.firstname.value).toBe(this.user.firstName);
            expect(contact.properties.lastname.value).toBe(this.user.lastName);
            expect(contact.properties.applications.value).toBe('apps');
            expect(contact.properties.lifecyclestage.value).toBe('subscriber');
            expect(contact.properties.payment_plan.value).toBe('Business');
        }).then(done, done.fail);
    });
});
