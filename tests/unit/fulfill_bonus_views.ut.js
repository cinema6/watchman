'use strict';

const createUuid = require('rc-uuid').createUuid;
const proxyquire = require('proxyquire');
const logger = require('cwrx/lib/logger');
const resolveURL = require('url').resolve;
const q = require('q');
const moment = require('moment');

function defer() {
    const deferred = {};
    const promise = new Promise((resolve, reject) => {
        deferred.resolve = resolve;
        deferred.reject = reject;
    });

    deferred.promise = promise;

    return deferred;
}

describe('fulfill_bonus_views', () => {
    let JsonProducer, CwrxRequest;
    let factory;

    beforeEach(() => {
        JsonProducer = (function(JsonProducer) {
            return jasmine.createSpy('JsonProducer()').and.callFake(function(name, options) {
                let producer = new JsonProducer(name, options);

                spyOn(producer, 'produce').and.returnValue(q.defer().promise);

                return producer;
            });
        }(require('rc-kinesis').JsonProducer));

        CwrxRequest = (function(CwrxRequest) {
            return jasmine.createSpy('CwrxRequest()').and.callFake(function(creds) {
                let request = new CwrxRequest(creds);

                spyOn(request, 'send').and.returnValue(q.defer().promise);

                return request;
            });
        }(require('../../lib/CwrxRequest')));

        factory = proxyquire('../../src/actions/fulfill_bonus_views', {
            'cwrx/lib/logger': logger,
            'rc-kinesis': {
                JsonProducer
            },
            '../../lib/CwrxRequest': CwrxRequest
        });
    });

    it('should exist', () => {
        expect(factory).toEqual(jasmine.any(Function));
    });

    describe('when called', () => {
        let config;
        let orgsEndpoint, paymentsEndpoint, promotionsEndpoint, paymentPlansEndpoint;
        let action;
        let request, watchmanStream, log;

        beforeEach(() => {
            config = {
                state: {
                    secrets: {
                        beeswax: {
                            email: 'ops@reelcontent.com',
                            password: 'wueyrfhu83rgf4u3gr'
                        }
                    }
                },
                beeswax: {
                    apiRoot: 'https://stingersbx.api.beeswax.com'
                },
                appCreds: {
                    key: 'watchman-dev',
                    secret: 'dwei9fhj3489ghr7834909r'
                },
                cwrx: {
                    api: {
                        root: 'http://33.33.33.10/',
                        payments: {
                            endpoint: '/api/payments/'
                        },
                        promotions: {
                            endpoint: '/api/promotions'
                        },
                        orgs: {
                            endpoint: '/api/account/orgs'
                        },
                        paymentPlans: {
                            endpoint: '/api/payment-plans'
                        }
                    }
                },
                kinesis: {
                    producer: {
                        region: 'us-east-1',
                        stream: 'devWatchmanStream'
                    }
                }
            };

            orgsEndpoint = resolveURL(config.cwrx.api.root, config.cwrx.api.orgs.endpoint);
            paymentsEndpoint = resolveURL(config.cwrx.api.root, config.cwrx.api.payments.endpoint);
            promotionsEndpoint = resolveURL(config.cwrx.api.root, config.cwrx.api.promotions.endpoint);
            paymentPlansEndpoint = resolveURL(config.cwrx.api.root, config.cwrx.api.paymentPlans.endpoint);

            spyOn(logger, 'getLog').and.returnValue(log = jasmine.createSpyObj('log', [
                'trace',
                'info',
                'warn',
                'error'
            ]));

            action = factory(config);
            request = CwrxRequest.calls.mostRecent().returnValue;
            watchmanStream = JsonProducer.calls.mostRecent().returnValue;
        });

        it('should return an action', () => {
            expect(action).toEqual(jasmine.any(Function));
        });

        it('should create a JsonProducer for watchman', () => {
            expect(JsonProducer).toHaveBeenCalledWith(config.kinesis.producer.stream, config.kinesis.producer);
        });

        it('should create a CwrxRequest', () => {
            expect(CwrxRequest).toHaveBeenCalledWith(config.appCreds);
        });

        describe('(the action)', () => {
            let transaction;
            let getOrgDeferred, getPaymentsDeferred, getPromotionDeferreds, getPaymentPlanDeferred;
            let event;
            let success, failure;

            beforeEach(done => {
                success = jasmine.createSpy('success()');
                failure = jasmine.createSpy('failure()');

                transaction = {
                    id: `t-${createUuid()}`,
                    amount: 49.99,
                    paymentPlanId: `pp-${createUuid()}`,
                    org: `o-${createUuid()}`
                };

                event = {
                    data: {
                        transaction,
                        date: moment().utcOffset(0).format()
                    },
                    options: {
                        target: 'showcase'
                    }
                };

                getOrgDeferred = q.defer();
                getPaymentsDeferred = q.defer();
                getPromotionDeferreds = {};
                getPaymentPlanDeferred = q.defer();

                spyOn(request, 'get').and.callFake(config => {
                    if (config.url === `${orgsEndpoint}/${transaction.org}`) {
                        return getOrgDeferred.promise;
                    }

                    if (config.url === paymentsEndpoint) {
                        return getPaymentsDeferred.promise;
                    }

                    if (config.url.indexOf(promotionsEndpoint) > -1) {
                        const promotionId = config.url.match(/pro-.+$/)[0];
                        const deferred = q.defer();

                        getPromotionDeferreds[promotionId] = deferred;

                        return deferred.promise;
                    }

                    if (config.url === `${paymentPlansEndpoint}/${transaction.paymentPlanId}`) {
                        return getPaymentPlanDeferred.promise;
                    }

                    return q.reject(new Error('Could not match the endpoint!'));
                });

                action(event).then(success, failure);
                setTimeout(done);
            });

            it('should get the org', () => {
                expect(request.get).toHaveBeenCalledWith({
                    url: `${orgsEndpoint}/${transaction.org}`
                });
            });

            it('should get the org\'s payments', () => {
                expect(request.get).toHaveBeenCalledWith({
                    url: paymentsEndpoint,
                    qs: {
                        org: transaction.org
                    }
                });
            });

            describe('if the transaction has no paymentPlanId', () => {
                beforeEach(done => {
                    transaction.paymentPlanId = null;

                    success.calls.reset();
                    failure.calls.reset();
                    request.get.calls.reset();
                    watchmanStream.produce.calls.reset();

                    action(event).then(success, failure);
                    setTimeout(done);
                });

                it('should not get anything', () => {
                    expect(request.get).not.toHaveBeenCalled();
                });

                it('should not produce any records', () => {
                    expect(watchmanStream.produce).not.toHaveBeenCalled();
                });

                it('should log an error', () => {
                    expect(log.error).toHaveBeenCalled();
                });

                it('should fulfill with undefined', () => {
                    expect(success).toHaveBeenCalledWith(undefined);
                });
            });

            describe('if the payments can\'t be fetched', () => {
                let reason;

                beforeEach(done => {
                    reason = new Error('There was an issue.');
                    getPaymentsDeferred.reject(reason);
                    setTimeout(done);
                });

                it('should log an error', () => {
                    expect(log.error).toHaveBeenCalled();
                });

                it('should fulfill with undefined', () => {
                    expect(success).toHaveBeenCalledWith(undefined);
                });
            });

            describe('if there is more than one payment', () => {
                let payments;
                let org;

                beforeEach(done => {
                    org = {
                        id: `o-${createUuid()}`,
                        promotions: [
                            {
                                id: 'pro-' + createUuid(),
                                created: moment().format(),
                                lastUpdated: moment().format(),
                                status: 'active'
                            }
                        ]
                    };

                    payments = [
                        {
                            id: createUuid(),
                            status: 'settled',
                            type: 'sale',
                            amount: 149.99,
                            createdAt: moment().format(),
                            updatedAt: moment().format(),
                            method: {}
                        },
                        {
                            id: createUuid(),
                            status: 'settled',
                            type: 'sale',
                            amount: 149.99,
                            createdAt: moment().subtract(1, 'month').format(),
                            updatedAt: moment().subtract(1, 'month').format(),
                            method: {}
                        }
                    ];

                    getPaymentsDeferred.resolve([payments, { statusCode: 200 }]);
                    getOrgDeferred.resolve([org, { statusCode: 200 }]);
                    setTimeout(done);
                    request.get.calls.reset();
                });

                it('should not get anything', () => {
                    expect(request.get).not.toHaveBeenCalled();
                });

                it('should not produce any records', () => {
                    expect(watchmanStream.produce).not.toHaveBeenCalled();
                });

                it('should fulfill with undefined', () => {
                    expect(success).toHaveBeenCalledWith(undefined);
                });
            });

            describe('if the org', () => {
                let org;

                beforeEach(() => {
                    org = {
                        id: `o-${createUuid()}`
                    };
                });

                [
                    {
                        description: 'if the org has no promotions',
                        before: () => {
                            delete org.promotions;
                        }
                    },
                    {
                        description: 'if the org has an empty promotions array',
                        before: () => {
                            org.promotions = [];
                        }
                    }
                ].forEach(testConfig => {
                    describe(testConfig.description, () => {
                        let payments;

                        beforeEach(done => {
                            watchmanStream.produce.calls.reset();
                            request.get.calls.reset();

                            testConfig.before();

                            payments = [
                                {
                                    id: createUuid(),
                                    status: 'settled',
                                    type: 'sale',
                                    amount: 149.99,
                                    createdAt: moment().format(),
                                    updatedAt: moment().format(),
                                    method: {}
                                }
                            ];

                            getOrgDeferred.resolve([org, { statusCode: 200 }]);
                            getPaymentsDeferred.resolve([payments, { statusCode: 200 }]);
                            setTimeout(done);
                        });

                        it('should not get anything', () => {
                            expect(request.get).not.toHaveBeenCalled();
                        });

                        it('should not produce anything', () => {
                            expect(watchmanStream.produce).not.toHaveBeenCalled();
                        });

                        it('should fulfill with undefined', () => {
                            expect(success).toHaveBeenCalledWith(undefined);
                        });
                    });
                });

                describe('has promotions', () => {
                    let payments;

                    beforeEach(done => {
                        org.promotions = [
                            {
                                id: 'pro-' + createUuid(),
                                created: moment().format(),
                                lastUpdated: moment().format(),
                                status: 'active'
                            },
                            {
                                id: 'pro-' + createUuid(),
                                created: moment().format(),
                                lastUpdated: moment().format(),
                                status: 'active'
                            },
                            {
                                id: 'pro-' + createUuid(),
                                created: moment().format(),
                                lastUpdated: moment().format(),
                                status: 'active'
                            },
                            {
                                id: 'pro-' + createUuid(),
                                created: moment().format(),
                                lastUpdated: moment().format(),
                                status: 'active'
                            },
                            {
                                id: 'pro-' + createUuid(),
                                created: moment().format(),
                                lastUpdated: moment().format(),
                                status: 'active'
                            }
                        ];

                        payments = [
                            {
                                id: createUuid(),
                                status: 'settled',
                                type: 'sale',
                                amount: 149.99,
                                createdAt: moment().format(),
                                updatedAt: moment().format(),
                                method: {}
                            }
                        ];

                        getOrgDeferred.resolve([org, { statusCode: 200 }]);
                        getPaymentsDeferred.resolve([payments, { statusCode: 200 }]);
                        setTimeout(done);
                    });

                    it('should get the org\'s promotions', () => {
                        org.promotions.forEach(promotion => expect(request.get).toHaveBeenCalledWith({
                            url: `${promotionsEndpoint}/${promotion.id}`
                        }));
                    });

                    describe('if a promotion can\'t be fetched', () => {
                        let reason;

                        beforeEach(done => {
                            reason = new Error('There was an issue.');
                            getPromotionDeferreds[org.promotions[0].id].reject(reason);
                            setTimeout(done);
                            request.get.calls.reset();
                        });

                        it('should not get anything else', () => {
                            expect(request.get).not.toHaveBeenCalled();
                        });

                        it('should not produce any records', () => {
                            expect(watchmanStream.produce).not.toHaveBeenCalled();
                        });

                        it('should log an error', () => {
                            expect(log.error).toHaveBeenCalled();
                        });

                        it('should fulfill with undefined', () => {
                            expect(success).toHaveBeenCalledWith(undefined);
                        });
                    });

                    describe('if the org has no bonus view promotions', () => {
                        let promotions;

                        beforeEach(done => {
                            promotions = [
                                {
                                    id: org.promotions[0].id,
                                    type: 'freeTrial',
                                    data: {
                                        [transaction.paymentPlanId]: {
                                            trialLength: 14,
                                            targetUsers: 1000
                                        }
                                    }
                                },
                                {
                                    id: org.promotions[1].id,
                                    type: 'signupReward',
                                    data: {
                                        [transaction.paymentPlanId]: {
                                            trialLength: null,
                                            targetUsers: 1000
                                        }
                                    }
                                },
                                {
                                    id: org.promotions[2].id,
                                    type: 'freeTrial',
                                    data: {
                                        [`pp-${createUuid()}`]: {
                                            trialLength: null,
                                            targetUsers: 1000
                                        }
                                    }
                                },
                                {
                                    id: org.promotions[3].id,
                                    type: 'freeTrial',
                                    data: {
                                        [transaction.paymentPlanId]: {
                                            trialLength: 2,
                                            targetUsers: 2000
                                        }
                                    }
                                },
                                {
                                    id: org.promotions[4].id,
                                    type: 'freeTrial',
                                    data: {
                                        [transaction.paymentPlanId]: {
                                            trialLength: 7,
                                            targetUsers: 1000
                                        }
                                    }
                                }
                            ];

                            promotions.forEach(promotion => getPromotionDeferreds[promotion.id].resolve([promotion, { statusCode: 200 }]));

                            setTimeout(done);
                            request.get.calls.reset();
                        });

                        it('should not get anything else', () => {
                            expect(request.get).not.toHaveBeenCalled();
                        });

                        it('should not produce any records', () => {
                            expect(watchmanStream.produce).not.toHaveBeenCalled();
                        });

                        it('should fulfill with undefined', () => {
                            expect(success).toHaveBeenCalledWith(undefined);
                        });
                    });

                    describe('when the promotions are fetched', () => {
                        let promotions;
                        let produceDeferreds;

                        beforeEach(done => {
                            promotions = [
                                {
                                    id: org.promotions[0].id,
                                    type: 'freeTrial',
                                    data: {
                                        [transaction.paymentPlanId]: {
                                            trialLength: null,
                                            targetUsers: 1000
                                        }
                                    }
                                },
                                {
                                    id: org.promotions[1].id,
                                    type: 'signupReward',
                                    data: {
                                        [transaction.paymentPlanId]: {
                                            trialLength: null,
                                            targetUsers: 1000
                                        }
                                    }
                                },
                                {
                                    id: org.promotions[2].id,
                                    type: 'freeTrial',
                                    data: {
                                        [`pp-${createUuid()}`]: {
                                            trialLength: null,
                                            targetUsers: 1000
                                        }
                                    }
                                },
                                {
                                    id: org.promotions[3].id,
                                    type: 'freeTrial',
                                    data: {
                                        [transaction.paymentPlanId]: {
                                            trialLength: null,
                                            targetUsers: 2000
                                        }
                                    }
                                },
                                {
                                    id: org.promotions[4].id,
                                    type: 'freeTrial',
                                    data: {
                                        [transaction.paymentPlanId]: {
                                            trialLength: 7,
                                            targetUsers: 1000
                                        }
                                    }
                                }
                            ];

                            promotions.forEach(promotion => getPromotionDeferreds[promotion.id].resolve([promotion, { statusCode: 200 }]));

                            produceDeferreds = [];
                            watchmanStream.produce.and.callFake(() => {
                                const deferred = defer();

                                produceDeferreds.push(deferred);

                                return deferred.promise;
                            });

                            setTimeout(done);
                            request.get.calls.reset();
                        });

                        it('should get the paymentPlan', () => {
                            expect(request.get).toHaveBeenCalledWith({
                                url: `${paymentPlansEndpoint}/${transaction.paymentPlanId}`
                            });
                        });

                        describe('if the payment plan can\'t be fetched', () => {
                            let reason;

                            beforeEach(done => {
                                reason = new Error('There was an issue.');
                                getPaymentPlanDeferred.reject(reason);
                                setTimeout(done);
                            });

                            it('should not produce any records', () => {
                                expect(watchmanStream.produce).not.toHaveBeenCalled();
                            });

                            it('should log an error', () => {
                                expect(log.error).toHaveBeenCalled();
                            });

                            it('should fulfill with undefined', () => {
                                expect(success).toHaveBeenCalledWith(undefined);
                            });
                        });

                        describe('when the payment plan is fetched', () => {
                            let paymentPlan;

                            beforeEach(done => {
                                paymentPlan = {
                                    id: transaction.paymentPlanId,
                                    viewsPerMonth: 2000
                                };
                                getPaymentPlanDeferred.resolve([paymentPlan, { statusCode: 200 }]);
                                setTimeout(done);
                            });

                            it('should fulfill the bonus views promotions', () => {
                                expect(watchmanStream.produce.calls.count()).toBe(2);

                                expect(watchmanStream.produce).toHaveBeenCalledWith({
                                    type: 'promotionFulfilled',
                                    data: {
                                        org,
                                        paymentPlan,
                                        promotion: promotions[0],
                                        target: event.options.target,
                                        date: moment(event.data.date).format()
                                    }
                                });
                                expect(watchmanStream.produce).toHaveBeenCalledWith({
                                    type: 'promotionFulfilled',
                                    data: {
                                        org,
                                        paymentPlan,
                                        promotion: promotions[3],
                                        target: event.options.target,
                                        date: moment(event.data.date).format()
                                    }
                                });
                            });

                            describe('when the records are produced', () => {
                                beforeEach(done => {
                                    produceDeferreds.forEach((deferred, index) => deferred.resolve(watchmanStream.produce.calls.all()[index].args[0]));
                                    setTimeout(done);
                                });

                                it('should fulfill with undefined', () => {
                                    expect(success).toHaveBeenCalledWith(undefined);
                                });
                            });

                            describe('if the record can\'t be produced', () => {
                                let reason;

                                beforeEach(done => {
                                    reason = new Error('There was an issue.');
                                    produceDeferreds[0].reject(reason);
                                    setTimeout(done);
                                });

                                it('should log an error', () => {
                                    expect(log.error).toHaveBeenCalled();
                                });

                                it('should fulfill with undefined', () => {
                                    expect(success).toHaveBeenCalledWith(undefined);
                                });
                            });
                        });
                    });
                });
            });
        });
    });
});
