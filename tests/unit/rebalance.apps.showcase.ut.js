'use strict';

const proxyquire = require('proxyquire');

function defer() {
    const deferred = {};
    const promise = new Promise((resolve, reject) => {
        deferred.resolve = resolve;
        deferred.reject = reject;
    });

    deferred.promise = promise;

    return deferred;
}

describe('(action factory) charge_payment_plan', () => {
    let q, uuid, logger;
    let JsonProducer, CwrxRequest, showcaseLib;
    let factory;

    beforeAll(() => {
        q = require('q');
        uuid = require('rc-uuid');
        logger = require('cwrx/lib/logger');
    });

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

        showcaseLib = (showcaseLib => jasmine.createSpy('showcase()').and.callFake(showcaseLib))(require('../../lib/showcase'));

        factory = proxyquire('../../src/actions/showcase/apps/rebalance', {
            'rc-kinesis': {
                JsonProducer
            },
            '../../lib/CwrxRequest': CwrxRequest,
            '../../../../lib/showcase': showcaseLib
        });
    });

    it('should exist', () => {
        expect(factory).toEqual(jasmine.any(Function));
    });

    describe('when called', () => {
        let config;
        let action;
        let log, showcase;

        beforeEach(() => {
            config = {
                appCreds: {
                    key: 'watchman-dev',
                    secret: 'dwei9fhj3489ghr7834909r'
                },
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
                cwrx: {
                    api: {
                        root: 'http://33.33.33.10/',
                        payments: {
                            endpoint: '/api/payments/'
                        },
                        orgs: {
                            endpoint: '/api/account/orgs'
                        },
                        campaigns: {
                            endpoint: '/api/campaigns'
                        },
                        transactions: {
                            endpoint: '/api/transactions'
                        },
                        analytics: {
                            endpoint: '/api/analytics'
                        },
                        placements: {
                            endpoint: '/api/placements'
                        },
                        advertisers: {
                            endpoint: '/api/account/advertisers'
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

            spyOn(logger, 'getLog').and.returnValue(log = jasmine.createSpyObj('log', [
                'info',
                'trace',
                'warn',
                'error'
            ]));

            action = factory(config);

            showcase = showcaseLib.calls.mostRecent().returnValue;
        });

        it('should return the action Function', () => {
            expect(action).toEqual(jasmine.any(Function));
        });

        it('should create a showcase lib', () => {
            expect(showcaseLib).toHaveBeenCalledWith(config);
        });

        describe('the action', () => {
            let data, options, event;
            let rebalanceDeferred;
            let success, failure;

            beforeEach(function(done) {
                data = {
                    transaction: {
                        id: 't-' + uuid.createUuid(),
                        created: new Date().toISOString(),
                        transactionTS: new Date().toISOString(),
                        amount: 50,
                        sign: 1,
                        units: 1,
                        org: 'o-' + uuid.createUuid(),
                        campaign: null,
                        braintreeId: null,
                        promotion: 'pro-' + uuid.createUuid(),
                        application: 'showcase',
                        paymentPlanId: null,
                        targetUsers: 2000,
                        cycleStart: null,
                        cycleEnd: null,
                        description: JSON.stringify({ eventType: 'credit', source: 'braintree' })
                    }
                };
                options = {
                    target: 'showcase'
                };
                event = { data: data, options: options };

                success = jasmine.createSpy('success()');
                failure = jasmine.createSpy('failure()');

                rebalanceDeferred = defer();
                spyOn(showcase, 'rebalance').and.returnValue(rebalanceDeferred.promise);

                action(event).then(success, failure);
                setTimeout(done);
            });

            it('should rebalance the org', () => {
                expect(showcase.rebalance).toHaveBeenCalledWith(data.transaction.org);
            });

            describe('when the rebalance is finished', () => {
                beforeEach(done => {
                    rebalanceDeferred.resolve([]);
                    setTimeout(done);
                });

                it('should fulfill with undefined', () => {
                    expect(success).toHaveBeenCalledWith(undefined);
                });
            });

            describe('if the rebalance fails', () => {
                let reason;

                beforeEach(done => {
                    reason = new Error('There was an issue!');
                    rebalanceDeferred.reject(reason);
                    setTimeout(done);
                });

                it('should log an error', () => {
                    expect(log.error).toHaveBeenCalled();
                });

                it('should fulfill with undefined', () => {
                    expect(success).toHaveBeenCalledWith(undefined);
                });
            });

            describe('if the required data is not present', () => {
                beforeEach(done => {
                    success.calls.reset();
                    failure.calls.reset();
                    showcase.rebalance.calls.reset();

                    event.data = {};

                    action(event).then(success, failure);
                    setTimeout(done);
                });

                it('should not rebalance', () => {
                    expect(showcase.rebalance).not.toHaveBeenCalled();
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
