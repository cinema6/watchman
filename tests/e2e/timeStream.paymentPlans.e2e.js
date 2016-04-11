'use strict';

/* jshint camelcase:false */

var JsonProducer = require('rc-kinesis').JsonProducer;
var q = require('q');
var testUtils = require('cwrx/test/e2e/testUtils.js');
var ld = require('lodash');
var CwrxRequest = require('../../lib/CwrxRequest');
var Mailman = testUtils.Mailman;
var resolveURL = require('url').resolve;
var uuid = require('rc-uuid');
var moment = require('moment');
var braintree = require('braintree');

var API_ROOT = process.env.apiRoot;
var APP_CREDS = JSON.parse(process.env.appCreds);
var AWS_CREDS = JSON.parse(process.env.awsCreds);
var TIME_STREAM = process.env.timeStream;
var paymentPlans = require('../../environments/development.json').default_attributes.watchman.app.config.paymentPlans;

function createId(prefix) {
    return prefix + '-' + uuid.createUuid();
}

function waitUntil(predicate) {
    function check() {
        return q(predicate()).then(function(value) {
            if (value) {
                return value;
            } else {
                return q.delay(500).then(check);
            }
        });
    }

    return check();
}

function wait(time) {
    return waitUntil(function() { return q.delay(time).thenResolve(true); });
}

describe('timeStream payment plan billing', function() {
    var producer, request, mailman, cookies, gateway;
    var user, org, paymentMethod, paymentPlan;

    var getPaymentPlanId = (function() {
        var paymentPlanIds = Object.keys(paymentPlans).slice(0, -1);

        return function getPaymentPlanId() {
            return ld.sample(paymentPlanIds);
        };
    }());

    var getValidPaymentNonce = (function() {
        var validNonces = [
            'fake-valid-visa-nonce',
            'fake-valid-amex-nonce',
            'fake-valid-mastercard-nonce',
            'fake-valid-discover-nonce',
            'fake-paypal-future-nonce'
        ];

        return function getValidPaymentNonce() {
            return ld.sample(validNonces);
        };
    }());

    var getInvalidPaymentNonce = (function() {
        var invalidNonces = [
            'fake-processor-declined-visa-nonce',
            'fake-processor-declined-mastercard-nonce',
            'fake-processor-declined-amex-nonce',
            'fake-processor-declined-discover-nonce'
        ];

        return function getInvalidPaymentNonce() {
            return ld.sample(invalidNonces);
        };
    }());

    function api(endpoint) {
        return resolveURL(API_ROOT, endpoint);
    }

    function dailyEvent(time) {
        return producer.produce({
            type: 'daily',
            data: {
                date: time.format()
            }
        }).delay(15000);
    }

    function getMail(subject) {
        return new q.Promise(function(resolve, reject) {
            mailman.once(subject, resolve).once('error', reject);
        });
    }

    function updatePaymentMethod(nonce) {
        return request.post({
            url: api('/api/payments/methods'),
            json: {
                paymentMethodNonce: nonce,
                makeDefault: true,
                cardholderName: 'Johnny Testmonkey'
            },
            jar: cookies
        }).spread(function(body) { return body; });
    }

    function updatePaymentPlan(id) {
        return request.put({
            url: api('/api/account/orgs/' + org.id),
            json: {
                paymentPlanId: id
            }
        }).spread(function(body) { return body; });
    }

    function createUser() {
        var orgId = createId('o');
        var userId = createId('u');
        var policyId = createId('p');

        return testUtils.resetCollection('orgs', [{
            id: orgId,
            status: 'active',
            name: 'The Best Org',
            paymentPlanId: getPaymentPlanId()
        }]).then(function makePolicy() {
            return testUtils.resetCollection('policies', [{
                id: policyId,
                name: 'manageAllOrgs',
                status: 'active',
                priority: 1,
                permissions: {
                    orgs: { read: 'all', create: 'all', edit: 'own', delete: 'own' }
                },
                entitlements: {
                    makePayment: true
                }
            }]);
        }).then(function makeUser() {
            return testUtils.resetCollection('users', [{
                id: userId,
                status: 'active',
                firstName: 'Johnny',
                lastName: 'Testmonkey',
                company: 'Bananas 4 Bananas, Inc.',
                email: 'c6e2etester@gmail.com',
                password: '$2a$10$XomlyDak6mGSgrC/g1L7FO.4kMRkj4UturtKSzy6mFeL8QWOBmIWq',
                org: orgId,
                policies: ['manageAllOrgs']
            }]);
        }).then(function getUser() {
            return request.get({
                url: api('/api/account/users/' + userId)
            }).then(ld.property(0));
        }).then(function login(user) {
            return request.post({
                url: api('/api/auth/login'),
                json: {
                    email: user.email,
                    password: 'password'
                },
                jar: cookies
            });
        }).then(function() {
            return updatePaymentMethod(getValidPaymentNonce());
        }).then(function fetchEntities(paymentMethod) {
            return q.all([
                request.get({
                    url: api('/api/account/users/' + userId)
                }).then(ld.property(0)),
                request.get({
                    url: api('/api/account/orgs/' + orgId)
                }).then(ld.property(0)),
                paymentMethod
            ]);
        });
    }

    function deleteUser(user) {
        return request.delete({
            url: api('/api/account/users/' + user.id)
        }).then(function deleteOrg() {
            return request.delete({
                url: api('/api/account/orgs/' + user.org)
            });
        }).thenResolve(null);
    }

    function getMostRecentPayment() {
        return waitUntil(function() {
            return getPayments().then(ld.property('0'));
        });
    }

    function getPayments() {
        return request.get({
            url: api('/api/payments'),
            jar: cookies
        }).then(ld.property('0'));
    }

    function createPayment(amount) {
        return request.post({
            url: api('/api/payments'),
            jar: cookies,
            json: {
                paymentMethod: paymentMethod.token,
                amount: amount
            }
        }).spread(function(payment) {
            return q.ninvoke(gateway.testing, 'settle', payment.id);
        }).then(function() {
            return waitUntil(function() {
                return getMostRecentPayment().then(function(payment) {
                    return payment.status === 'settled' && payment;
                });
            });
        });
    }

    beforeAll(function(done) {
        var awsConfig = ld.assign({ region: 'us-east-1' }, AWS_CREDS || {});

        jasmine.DEFAULT_TIMEOUT_INTERVAL = 120000;

        producer = new JsonProducer(TIME_STREAM, awsConfig);
        request = new CwrxRequest(APP_CREDS);
        mailman = new Mailman();

        q.all([
            mailman.start()
        ]).then(done, done.fail);
    });

    beforeEach(function(done) {
        var cwrxApp = {
            id: 'app-cwrx',
            created: new Date(),
            lastUpdated: new Date(),
            status: 'active',
            key: 'cwrx-services',
            secret: 'ade2cfd7ec2e71d54064fb8cfb1cc92be1d01ffd',
            permissions: {
                orgs: { create: 'all' },
                advertisers: { create: 'all' },
                transactions: { create: 'all' }
            },
            fieldValidation: {
                advertisers: {
                    org: { __allowed: true }
                },
                orgs: {
                    referralCode: { __allowed: true }
                }
            },
            entitlements: {
                directEditCampaigns: true
            }
        };
        var watchmanApp = {
            id: createId('app'),
            key: APP_CREDS.key,
            status: 'active',
            secret: APP_CREDS.secret,
            permissions: {
                campaigns: { read: 'all', create: 'all', edit: 'all', delete: 'all' },
                cards: { read: 'all', create: 'all', edit: 'all', delete: 'all' },
                users: { read: 'all', create: 'all', edit: 'all', delete: 'all' },
                orgs: { read: 'all', create: 'all', edit: 'all', delete: 'all' }
            },
            entitlements: {
                directEditCampaigns: true,
                makePaymentForAny: true
            },
            fieldValidation: {
                'campaigns': {
                    'status': {
                        '__allowed': true
                    }
                }
            }
        };

        cookies = require('request').jar();
        gateway = braintree.connect({
            environment: braintree.Environment.Sandbox,
            merchantId: 'ztrphcf283bxgn2f',
            publicKey: 'rz2pht7gyn6d266b',
            privateKey: '0a150dac004756370706a195e2bde296'
        });

        q.all([
            testUtils.resetCollection('applications', [watchmanApp, cwrxApp]),
            testUtils.resetCollection('policies', []),
            testUtils.resetCollection('orgs', []),
            testUtils.resetCollection('users', [])
        ]).then(function() {
            return createUser();
        }).spread(function(/*user, org, paymentMethod*/) {
            user = arguments[0];
            org = arguments[1];
            paymentMethod = arguments[2];

            paymentPlan = paymentPlans[org.paymentPlanId];
        }).then(done, done.fail);

        getInvalidPaymentNonce();
    });

    afterEach(function(done) {
        mailman.removeAllListeners();

        q.all([
            deleteUser(user)
        ]).then(done, done.fail);
    });

    afterAll(function(done) {
        q.all([
            mailman.stop()
        ]).then(done, done.fail);
    });

    describe('if no payments have been made', function() {
        var payment;

        beforeEach(function(done) {
            dailyEvent(moment().add(3, 'hours')).then(function() {
                return getMostRecentPayment();
            }).then(function(/*payment*/) {
                payment = arguments[0];
            }).then(done, done.fail);
        });

        it('should make a payment for the amount of the payment plan', function() {
            expect(payment.amount).toBe(paymentPlan.price);
        });
    });

    describe('if a payment was made', function() {
        beforeEach(function(done) {
            createPayment(ld.random(1, 500)).then(done, done.fail);
        });

        describe('less than a month ago', function() {
            var payments;

            beforeEach(function(done) {
                dailyEvent(moment().add(1, 'month').subtract(1, 'day')).then(function() {
                    return wait(3000);
                }).then(function() {
                    return getPayments();
                }).then(function(/*payments*/) {
                    payments = arguments[0];
                }).then(done, done.fail);
            });

            it('should not create another payment', function() {
                expect(payments.length).toBe(1, 'Another payment was created.');
            });
        });

        describe('one month ago', function() {
            var payments;

            beforeEach(function(done) {
                dailyEvent(moment().add(1, 'month')).then(function() {
                    return waitUntil(function() {
                        return getPayments().then(function(payments) {
                            return payments.length > 1 && payments;
                        });
                    });
                }).then(function(/*payments*/) {
                    payments = arguments[0];
                }).then(done, done.fail);
            });

            it('should create a payment', function() {
                expect(payments.length).toBe(2, 'New payment not created.');
                expect(payments[0].amount).toBe(paymentPlan.price);
            });
        });

        describe('over a month ago', function() {
            var payments;

            beforeEach(function(done) {
                dailyEvent(moment().add(1, 'month').add(1, 'day')).then(function() {
                    return waitUntil(function() {
                        return getPayments().then(function(payments) {
                            return payments.length > 1 && payments;
                        });
                    });
                }).then(function(/*payments*/) {
                    payments = arguments[0];
                }).then(done, done.fail);
            });

            it('should create a payment', function() {
                expect(payments.length).toBe(2, 'New payment not created.');
                expect(payments[0].amount).toBe(paymentPlan.price);
            });
        });
    });

    describe('if the user\'s card is declined', function() {
        var email;

        beforeEach(function(done) {
            var invalidPlanId = Object.keys(paymentPlans).slice(-1)[0]; // Get the last configured payment plan, whose amount will cause a failure.

            getMail('We Hit a Snag').then(function(/*email*/) {
                email = arguments[0];
            }).then(done, done.fail);

            updatePaymentPlan(invalidPlanId).then(function(/*org*/) {
                org = arguments[0];
                paymentPlan = paymentPlans[invalidPlanId];

                return dailyEvent(moment().add(3, 'hours'));
            }).catch(done.fail);
        });

        it('should send the user an email', function() {
            expect(email.text).toContain('PLEASE CHECK YOUR PAYMENT METHOD');
            expect(email.from[0].address.toLowerCase()).toBe('no-reply@reelcontent.com');
            expect(email.to[0].address.toLowerCase()).toBe(user.email);
            expect(moment(email.date).isAfter(moment().subtract(1, 'minute'))).toBe(true, 'Email is too old.');
        });
    });
});
