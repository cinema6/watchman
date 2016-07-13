var CwrxRequest = require('../../lib/CwrxRequest.js');
var JsonProducer = require('rc-kinesis').JsonProducer;
var Q = require('q');
var checkWeekiversary = require('../../src/actions/check_weekiversary.js');
var ld = require('lodash');
var moment = require('moment');

describe('check_weekiversary', function() {
    'use strict';

    beforeEach(function() {
        this.config = {
            appCreds: { },
            cwrx: {
                api: {
                    root: 'https://root.com',
                    campaigns: {
                        endpoint: 'api/campaigns'
                    },
                    users: {
                        endpoint: 'api/account/users'
                    }
                }
            },
            kinesis: {
                producer: { }
            }
        };
        this.event = {
            data: { },
            options: { }
        };
        spyOn(CwrxRequest.prototype, 'get');
        spyOn(JsonProducer.prototype, 'produce');
        this.action = checkWeekiversary(this.config);
    });

    it('should export a factory function', function() {
        expect(checkWeekiversary).toEqual(jasmine.any(Function));
        expect(checkWeekiversary.name).toBe('factory');
    });

    it('should be able to create an action', function() {
        expect(this.action).toEqual(jasmine.any(Function));
    });

    it('should reject if not passed an org', function(done) {
        this.action(this.event).then(done.fail).catch(function(error) {
            expect(error).toBeDefined();
        }).then(done, done.fail);
    });

    it('should fetch the first created campaign which is not canceled or deleted for an org in data', function(done) {
        this.event.data.org = { id: 'o-123' };
        this.event.data.date = new Date();
        CwrxRequest.prototype.get.and.returnValue(Q.resolve([[]]));
        this.action(this.event).then(function() {
            expect(CwrxRequest.prototype.get).toHaveBeenCalledWith({
                url: 'https://root.com/api/campaigns',
                qs: {
                    application: 'showcase',
                    org: 'o-123',
                    statuses: 'draft,new,pending,approved,rejected,active,paused,inactive,expired,outOfBudget,error',
                    sort: 'created,1',
                    limit: '1'
                }
            });
        }).then(done, done.fail);
    });

    it('should fetch all users in the given org', function(done) {
        var campaigns = [{ id: 'cam-123', created: '2015-11-12T19:52:40.601Z' }];
        this.event.data.org = { id: 'o-123' };
        this.event.data.date = moment(campaigns[0].created).add(1, 'weeks').toISOString();
        CwrxRequest.prototype.get.and.callFake(function(options) {
            return Q.resolve([(/campaigns/.test(options.url)) ? campaigns : []]);
        });
        this.action(this.event).then(function() {
            expect(CwrxRequest.prototype.get).toHaveBeenCalledWith({
                url: 'https://root.com/api/account/users',
                qs: {
                    org: 'o-123'
                }
            });
        }).then(done, done.fail);
    });

    it('should produce on weekiversaries of an org\'s first campaign creation', function(done) {
        var self = this;
        var campaigns = [{ id: 'cam-123', created: '2015-11-12T19:52:40.601Z' }];
        var users = [{ id: 'u-123' }];
        var ten = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
        CwrxRequest.prototype.get.and.callFake(function(options) {
            return Q.resolve([(/campaigns/.test(options.url)) ? campaigns : users]);
        });
        return Q.all(ten.map(function(week) {
            return self.action({
                data: {
                    org: 'o-123',
                    date: moment(campaigns[0].created).add(week, 'weeks').toISOString()
                }
            });
        })).then(function() {
            ten.forEach(function(week) {
                expect(JsonProducer.prototype.produce.calls.count()).toBe(ten.length);
                expect(JsonProducer.prototype.produce).toHaveBeenCalledWith({
                    type: 'campaign_weekiversary',
                    data: {
                        campaign: campaigns[0],
                        user: users[0],
                        week: week
                    }
                });
            });
        }).then(done, done.fail);
    });

    it('should produce on weekiversaries for every user in the org', function(done) {
        var campaigns = [{ id: 'cam-123', created: '2015-11-12T19:52:40.601Z' }];
        var users = [{ id: 'u-123' }, { id: 'u-456' }];
        this.event.data.org = { id: 'o-123' };
        this.event.data.date = moment(campaigns[0].created).add(1, 'weeks').toISOString();
        CwrxRequest.prototype.get.and.callFake(function(options) {
            return Q.resolve([(/campaigns/.test(options.url)) ? campaigns : users]);
        });
        return this.action(this.event).then(function() {
            expect(JsonProducer.prototype.produce.calls.count()).toBe(users.length);
            users.forEach(function(user) {
                expect(JsonProducer.prototype.produce).toHaveBeenCalledWith({
                    type: 'campaign_weekiversary',
                    data: {
                        campaign: campaigns[0],
                        user: user,
                        week: 1
                    }
                });
            });
        }).then(done, done.fail);
    });

    it('should not produce on non-weekiversaries of an org\'s first campaign creation', function(done) {
        var self = this;
        var campaign = { id: 'cam-123', created: '2015-11-12T19:52:40.601Z' };
        this.event.data.org = { id: 'o-123' };
        CwrxRequest.prototype.get.and.returnValue(Q.resolve([[]]));
        return Q.all([0, 1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12, 13, 15].map(function(day) {
            self.event.data.date = moment(campaign.created).add(day, 'days').toISOString();
            return self.action(ld.assignIn({ }, self.event)).then(function() {
                expect(JsonProducer.prototype.produce).not.toHaveBeenCalled();
            });
        })).then(done, done.fail);
    });
});
