'use strict';

var JsonProducer = require('rc-kinesis').JsonProducer;
var Q = require('q');
var checkExpiryFactory = require('../../src/actions/check_expiry.js');

describe('check_expiry.js', function() {
    var mockOptions;
    var mockConfig;
    var checkExpiry;

    beforeEach(function() {
        mockOptions = { };
        mockConfig = {
            kinesis: {
                producer: {
                    stream: 'stream'
                }
            }
        };
        spyOn(JsonProducer.prototype, 'produce');

        checkExpiry = checkExpiryFactory(mockConfig);
    });

    describe('checking for an ended campaign', function() {
        it('should not produce if there is no end date on the campaign', function(done) {
            var mockDatas = [
                { },
                { campaign: null },
                { campaign: { cards: null } },
                { campaign: { cards: [] } },
                { campaign: { cards: [ { campaign: { } } ] } },
                { campaign: { cards: [ { campaign: { endDate: null } } ] } }
            ];
            Q.all(mockDatas.map(function(mockData) {
                return checkExpiry({ data: mockData, options: mockOptions });
            })).then(function() {
                expect(JsonProducer.prototype.produce).not.toHaveBeenCalled();
                done();
            }).catch(function(error) {
                done.fail(error);
            });
        });

        it('should not produce if the end date has not yet arrived', function(done) {
            var mockData = {
                campaign: {
                    cards: [
                        {
                            campaign: {
                                endDate: new Date(3000, 11, 17)
                            }
                        }
                    ]
                }
            };
            checkExpiry({ data: mockData, options: mockOptions }).then(function() {
                expect(JsonProducer.prototype.produce).not.toHaveBeenCalled();
                done();
            }).catch(function(error) {
                done.fail(error);
            });
        });

        it('should produce if the end date has passed for a current campaign', function(done) {
            var mockData = {
                campaign: {
                    cards: [
                        {
                            campaign: {
                                endDate: new Date(2000, 11, 17)
                            }
                        }
                    ]
                }
            };
            return checkExpiry({ data: mockData, options: mockOptions }).then(function() {
                expect(JsonProducer.prototype.produce).toHaveBeenCalledWith({
                    type: 'campaignExpired',
                    data: {
                        campaign: mockData.campaign,
                        date: jasmine.any(Date)
                    }
                });
            }).then(done, done.fail);
        });

        it('should not produce if the status is already expired', function(done) {
            var mockData = {
                campaign: {
                    status: 'expired',
                    cards: [
                        {
                            campaign: {
                                endDate: new Date(2000, 11, 17)
                            }
                        }
                    ]
                }
            };
            checkExpiry({ data: mockData, options: mockOptions }).then(function() {
                expect(JsonProducer.prototype.produce).not.toHaveBeenCalled();
                done();
            }).catch(function(error) {
                done.fail(error);
            });
        });
    });

    describe('checking for an out of budget campaign', function() {
        it('should not produce if there are no total spend analytics', function(done) {
            var mockDatas = [
                { campaign: { pricing: { budget: 'budget' } } },
                { analytics: { }, campaign: { pricing: { budget: 'budget' } } },
                { analytics: { summary: { } }, campaign: { pricing: { budget: 'budget' } } },
                { analytics: { summary: { totalSpend: null } },
                    campaign: { pricing: { budget: 'budget' } } }
            ];
            Q.all(mockDatas.map(function(mockData) {
                return checkExpiry({ data: mockData, options: mockOptions });
            })).then(function() {
                expect(JsonProducer.prototype.produce).not.toHaveBeenCalled();
                done();
            }).catch(function(error) {
                done.fail(error);
            });
        });

        it('should not produce if there is no budget on the campaign', function(done) {
            var mockDatas = [
                { analytics: { summary: { totalSpend: 'spend' } } },
                { campaign: { }, analytics: { summary: { totalSpend: 'spend' } } },
                { campaign: { pricing: { } }, analytics: { summary: { totalSpend: 'spend' } } },
                { campaign: { pricing: { budget: null } },
                    analytics: { summary: { totalSpend: 'spend' } } }
            ];
            Q.all(mockDatas.map(function(mockData) {
                return checkExpiry({ data: mockData, options: mockOptions });
            })).then(function() {
                expect(JsonProducer.prototype.produce).not.toHaveBeenCalled();
                done();
            }).catch(function(error) {
                done.fail(error);
            });
        });

        it('should not produce if the budget has not yet been reached', function(done) {
            var mockData = {
                campaign: {
                    pricing: {
                        budget: 9000
                    }
                },
                analytics: {
                    summary: {
                        totalSpend: 4500
                    }
                }
            };
            checkExpiry({ data: mockData, options: mockOptions }).then(function() {
                expect(JsonProducer.prototype.produce).not.toHaveBeenCalled();
                done();
            }).catch(function(error) {
                done.fail(error);
            });
        });

        it('should produce if the budget has been reached for a current campaign', function(done) {
            var mockData = {
                campaign: {
                    pricing: {
                        budget: 9000
                    }
                },
                analytics: {
                    summary: {
                        totalSpend: 13500
                    }
                }
            };
            return checkExpiry({ data: mockData, options: mockOptions }).then(function() {
                expect(JsonProducer.prototype.produce).toHaveBeenCalledWith({
                    type: 'campaignReachedBudget',
                    data: {
                        campaign: mockData.campaign,
                        date: jasmine.any(Date)
                    }
                });
            }).then(done, done.fail);
        });

        it('should not produce if the status is already outOfBudget', function(done) {
            var mockData = {
                campaign: {
                    status: 'outOfBudget',
                    pricing: {
                        budget: 9000
                    }
                },
                analytics: {
                    summary: {
                        totalSpend: 13500
                    }
                }
            };
            checkExpiry({ data: mockData, options: mockOptions }).then(function() {
                expect(JsonProducer.prototype.produce).not.toHaveBeenCalled();
                done();
            }).catch(function(error) {
                done.fail(error);
            });
        });
    });
});
