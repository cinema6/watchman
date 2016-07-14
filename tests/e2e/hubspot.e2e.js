'use strict';

const Configurator = require('../helpers/Configurator.js');
const Hubspot = require('../../lib/Hubspot.js');
const ld = require('lodash');
const rcKinesis = require('rc-kinesis');
const rcUuid = require('rc-uuid');
const waiter = require('../helpers/waiter.js');

const API_ROOT = process.env.apiRoot;
const AWS_CREDS = JSON.parse(process.env.awsCreds);
const CWRX_STREAM = process.env.cwrxStream;
const PREFIX = process.env.appPrefix;
const SECRETS = JSON.parse(process.env.secrets);
const WATCHMAN_STREAM = process.env.watchmanStream;
const HUBSPOT_API_KEY = SECRETS.hubspot.key;

describe('hubspot integration', function() {
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
                                    paying_customer: 'true'
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
                                    applications: 'apps'
                                }
                            },
                            ifData: {
                                target: '^showcase$'
                            }
                        },
                        {
                            name: 'hubspot/update_user',
                            options: {
                                properties: {
                                    applications: 'apps',
                                    lifecyclestage: 'salesqualifiedlead'
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
                                    lifecyclestage: 'opportunity'
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
                            ifData: {
                                target: '^showcase$'
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
                                    lifecyclestage: 'customer'
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

    beforeAll(function() {
        const awsConfig = ld.assign({ region: 'us-east-1' }, AWS_CREDS || { });
        jasmine.DEFAULT_TIMEOUT_INTERVAL = 120000;
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
            )
        );
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
                lifecyclestage: 'salesqualifiedlead'
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
});
