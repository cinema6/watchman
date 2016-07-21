'use strict';

const q               = require('q');
const util            = require('util');
const logger          = require('cwrx/lib/logger.js');
const requestUtils    = require('cwrx/lib/requestUtils');
const actionFactory   = require('../../src/actions/create_promotion_credit.js');
const moment          = require('moment');

describe('create_promotion_credit.js', function() {
    let mockConfig, mockLog, event, transResp, createCredit;

    beforeEach(function() {
        mockConfig = {
            appCreds: 'i am watchman',
            cwrx: {
                api: {
                    root: 'http://test.com',
                    transactions: {
                        endpoint: '/api/transactions'
                    }
                }
            }
        };
        event = {
            data: {
                org: {
                    id: 'o-1',
                    status: 'active',
                    promotions: [{ id: 'pro-1', date: new Date('2016-04-07T19:39:43.671Z') }]
                },
                promotion: {
                    id: 'pro-1',
                    type: 'signupReward',
                    data: { rewardAmount: 50 }
                },
                date: moment().format()
            }
        };

        mockLog = {
            trace : jasmine.createSpy('log.trace'),
            error : jasmine.createSpy('log.error'),
            warn  : jasmine.createSpy('log.warn'),
            info  : jasmine.createSpy('log.info'),
            fatal : jasmine.createSpy('log.fatal'),
            log   : jasmine.createSpy('log.log')
        };
        spyOn(logger, 'getLog').and.returnValue(mockLog);

        transResp = {
            response: { statusCode: 201 },
            body: {
                id: 't-1',
                amount: 50.00,
                promotion: 'pro-1'
            }
        };

        spyOn(requestUtils, 'makeSignedRequest').and.callFake(function(/*creds, method, opts*/) {
            return q(transResp);
        });

        createCredit = actionFactory(mockConfig);
    });

    it('should skip if the event contains no org or promotion', function(done) {
        q.all([{}, { org: event.data.org }, { promotion: event.data.promotion }]
        .map(function(data) {
            event.data = data;
            return createCredit(event);
        }))
        .then(function() {
            expect(requestUtils.makeSignedRequest).not.toHaveBeenCalled();
            expect(mockLog.warn).not.toHaveBeenCalled();
            expect(mockLog.error).not.toHaveBeenCalled();
            done();
        }).catch(done.fail);
    });

    it('should create a credit transaction', function(done) {
        createCredit(event).then(function() {
            expect(requestUtils.makeSignedRequest).toHaveBeenCalledWith('i am watchman', 'post', {
                url: 'http://test.com/api/transactions',
                json: {
                    amount: 50,
                    org: 'o-1',
                    promotion: 'pro-1',
                    application: event.data.target
                }
            });
            expect(mockLog.warn).not.toHaveBeenCalled();
            expect(mockLog.error).not.toHaveBeenCalled();
            done();
        }).catch(done.fail);
    });

    it('should create a credit transaction for a freeTrial', function(done) {
        event.data.paymentPlan = {
            label: 'Starter',
            price: 49.51,
            maxCampaigns: 1,
            viewsPerMonth: 2000,
            id: 'pp-0Ekdsm05KVZ43Aqj',
            created: '2016-07-05T14:18:29.642Z',
            lastUpdated: '2016-07-05T14:28:57.336Z',
            status: 'active'
        };
        event.data.promotion = {
            id: 'pro-1',
            type: 'freeTrial',
            data: {
                [event.data.paymentPlan.id]: {
                    trialLength: 15,
                    paymentMethodRequired: false,
                    targetUsers: 1100
                }
            }
        };
        event.data.target = 'showcase';

        createCredit(event).then(function() {
            expect(requestUtils.makeSignedRequest).toHaveBeenCalledWith('i am watchman', 'post', {
                url: 'http://test.com/api/transactions',
                json: {
                    amount: 27.23,
                    org: 'o-1',
                    promotion: 'pro-1',
                    application: event.data.target,
                    paymentPlanId: event.data.paymentPlan.id,
                    targetUsers: event.data.promotion.data[event.data.paymentPlan.id].targetUsers,
                    cycleStart: moment(event.data.date).utcOffset(0).startOf('day').format(),
                    cycleEnd: moment(event.data.date).utcOffset(0).add(event.data.promotion.data[event.data.paymentPlan.id].trialLength, 'days').endOf('day').format()
                }
            });
            expect(mockLog.warn).not.toHaveBeenCalled();
            expect(mockLog.error).not.toHaveBeenCalled();
        }).then(done, done.fail);
    });

    it('should create a credit transaction for a freeTrial with no trialLength', function(done) {
        event.data.paymentPlan = {
            label: 'Starter',
            price: 49.51,
            maxCampaigns: 1,
            viewsPerMonth: 2000,
            id: 'pp-0Ekdsm05KVZ43Aqj',
            created: '2016-07-05T14:18:29.642Z',
            lastUpdated: '2016-07-05T14:28:57.336Z',
            status: 'active'
        };
        event.data.promotion = {
            id: 'pro-1',
            type: 'freeTrial',
            data: {
                [event.data.paymentPlan.id]: {
                    paymentMethodRequired: false,
                    targetUsers: 1100
                }
            }
        };
        event.data.target = 'showcase';

        createCredit(event).then(function() {
            expect(requestUtils.makeSignedRequest).toHaveBeenCalledWith('i am watchman', 'post', {
                url: 'http://test.com/api/transactions',
                json: {
                    amount: 27.23,
                    org: 'o-1',
                    promotion: 'pro-1',
                    application: event.data.target,
                    paymentPlanId: null,
                    targetUsers: event.data.promotion.data[event.data.paymentPlan.id].targetUsers,
                    cycleStart: null,
                    cycleEnd: null
                }
            });
            expect(mockLog.warn).not.toHaveBeenCalled();
            expect(mockLog.error).not.toHaveBeenCalled();
        }).then(done, done.fail);
    });

    it('should warn if there is not config in the promotion for the provided paymentPlan', function(done) {
        event.data.paymentPlan = {
            label: 'Starter',
            price: 49.51,
            maxCampaigns: 1,
            viewsPerMonth: 2000,
            id: 'pp-0Ekdsm05KVZ43Aqj',
            created: '2016-07-05T14:18:29.642Z',
            lastUpdated: '2016-07-05T14:28:57.336Z',
            status: 'active'
        };
        event.data.promotion = {
            id: 'pro-1',
            type: 'freeTrial',
            data: {
                'pp-0GK9a70bhh3mmVe6': {
                    trialLength: 15,
                    paymentMethodRequired: false,
                    targetUsers: 1100
                }
            }
        };
        event.data.target = 'showcase';

        createCredit(event).then(function() {
            expect(requestUtils.makeSignedRequest).not.toHaveBeenCalled();
            expect(mockLog.warn).toHaveBeenCalled();
            expect(mockLog.error).not.toHaveBeenCalled();
            done();
        }).then(done, done.fail);
    });

    it('should warn and skip if the promotion type is unrecognized', function(done) {
        event.data.promotion.type = 'freeee money';
        createCredit(event).then(function() {
            expect(requestUtils.makeSignedRequest).not.toHaveBeenCalled();
            expect(mockLog.warn).toHaveBeenCalled();
            expect(mockLog.error).not.toHaveBeenCalled();
            done();
        }).catch(done.fail);
    });

    it('should log an error if creating the transaction returns a 4xx', function(done) {
        transResp = { response: { statusCode: 400 }, body: 'I got a problem with YOU' };
        createCredit(event).then(function() {
            expect(mockLog.error).toHaveBeenCalled();
            expect(mockLog.error.calls.mostRecent().args).toContain(util.inspect((() => {
                const error = new Error('Error creating transaction');

                error.reason = {
                    code: 400,
                    body: 'I got a problem with YOU'
                };

                return error;
            })()));
            done();
        }).catch(done.fail);
    });

    it('should log an error if creating the transaction rejects', function(done) {
        transResp = q.reject('I GOT A PROBLEM');
        createCredit(event).then(function() {
            expect(mockLog.error).toHaveBeenCalled();
            expect(mockLog.error.calls.mostRecent().args)
                .toContain(util.inspect('I GOT A PROBLEM'));
            done();
        }).catch(done.fail);
    });
});
