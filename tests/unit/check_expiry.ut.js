'use strict';

var JsonProducer = require('../../src/producers/JsonProducer.js');
var Q = require('q');
var checkExpiry = require('../../src/actions/check_expiry.js');

describe('check_expiry.js', function() {
    var mockOptions;
    var mockConfig;
    
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
    });

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
            return checkExpiry(mockData, mockOptions, mockConfig);
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
                        campsign: {
                            endDate: new Date(3000, 11, 17)
                        }
                    }
                ]
            }
        };
        checkExpiry(mockData, mockOptions, mockConfig).then(function() {
            expect(JsonProducer.prototype.produce).not.toHaveBeenCalled();
            done();
        }).catch(function(error) {
            done.fail(error);
        });
    });
    
    it('should produce if the end date has passed', function(done) {
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
        checkExpiry(mockData, mockOptions, mockConfig).then(function() {
            expect(JsonProducer.prototype.produce).toHaveBeenCalledWith({
                type: 'campaignExpired',
                data: {
                    campaign: mockData.campaign
                }
            });
            done();
        }).catch(function(error) {
            done.fail(error);
        });
    });
});
