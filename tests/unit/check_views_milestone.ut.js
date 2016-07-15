'use strict';

const CwrxRequest = require('../../lib/CwrxRequest.js');
const checkViewsMilestone = require('../../src/actions/check_views_milestone.js');
const ld = require('lodash');
const rcKinesis = require('rc-kinesis');

describe('the check_views_milestone action', function() {
    beforeEach(function() {
        const config = {
            cwrx: {
                api: {
                    root: 'https://site.com',
                    campaigns: {
                        endpoint: 'campaigns'
                    },
                    analytics: {
                        endpoint: 'analytics'
                    }
                }
            },
            kinesis: {
                producer: { }
            }
        };
        spyOn(CwrxRequest.prototype, 'get');
        spyOn(rcKinesis.JsonProducer.prototype, 'produce');
        this.event = {
            data: { },
            options: { }
        };
        this.action = checkViewsMilestone(config);
    });

    it('should export an action factory', function() {
        expect(checkViewsMilestone).toEqual(jasmine.any(Function));
        expect(checkViewsMilestone.name).toBe('factory');
    });

    it('should be able to create an action', function() {
        expect(this.action).toEqual(jasmine.any(Function));
    });

    it('should fetch the campaign belonging to the given org', function(done) {
        CwrxRequest.prototype.get.and.returnValue(Promise.resolve([[]]));
        this.event.data.org = {
            id: 'o-123'
        };
        this.event.options.milestones = [100];
        this.action(this.event).then(() => {
            expect(CwrxRequest.prototype.get).toHaveBeenCalledWith({
                url: 'https://site.com/campaigns',
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

    it('should fetch the number of views for the fetched campaign', function(done) {
        CwrxRequest.prototype.get.and.callFake(endpoint => {
            if (/analytics/.test(endpoint)) {
                return Promise.resolve([{
                    summary: {
                        users: 123
                    }
                }]);
            } else {
                return Promise.resolve([[{
                    id: 'cam-123'
                }]]);
            }
        });
        this.event.data.org = {
            id: 'o-123'
        };
        this.event.options.milestones = [100];
        this.action(this.event).then(() => {
            expect(CwrxRequest.prototype.get).toHaveBeenCalledWith('https://site.com/analytics/campaigns/showcase/apps/cam-123');
        }).then(done, done.fail);
    });

    it('should not do anything if the org has no campaign', function(done) {
        CwrxRequest.prototype.get.and.returnValue(Promise.resolve([[]]));
        this.event.data.org = {
            id: 'o-123'
        };
        this.event.options.milestones = [100];
        this.action(this.event).then(() => {
            expect(CwrxRequest.prototype.get.calls.count()).toBe(1);
            expect(rcKinesis.JsonProducer.prototype.produce).not.toHaveBeenCalled();
        }).then(done, done.fail);
    });

    it('should not do anything if not passed any milestones', function(done) {
        this.event.data.org = {
            id: 'o-123'
        };
        this.event.options.milestones = [];
        this.action(this.event).then(() => {
            expect(CwrxRequest.prototype.get).not.toHaveBeenCalled();
            expect(rcKinesis.JsonProducer.prototype.produce).not.toHaveBeenCalled();
        }).then(done, done.fail);
    });

    it('should produce a views milestone event when a milestone is reached', function(done) {
        const milestones = [100, 200, 300];
        const orgs = ['o-123', 'o-456', 'o-789'];
        const campaigns = ['cam-123', 'cam-456', 'cam-789'];
        CwrxRequest.prototype.get.and.callFake(options => {
            if (/analytics/.test(options)) {
                const id = options.match(/(cam-\d+)/)[0];
                const views = milestones[campaigns.indexOf(id)] + 1;
                return Promise.resolve([{
                    summary: {
                        users: views
                    }
                }]);
            } else {
                const id = options.qs.org;
                const campaign = campaigns[orgs.indexOf(id)];
                return Promise.resolve([[{
                    id: campaign
                }]]);
            }
        });
        Promise.all(milestones.map((milestone, index) => {
            const event = ld.assign({ }, this.event, {
                data: {
                    org: {
                        id: orgs[index]
                    }
                },
                options: {
                    milestones: milestones
                }
            });
            return this.action(event);
        })).then(() => {
            milestones.map((milestone, index) => {
                expect(rcKinesis.JsonProducer.prototype.produce).toHaveBeenCalledWith({
                    type: 'views_milestone',
                    data: {
                        org: {
                            id: orgs[index]
                        },
                        campaign: {
                            id: campaigns[index]
                        },
                        analytics: {
                            summary: {
                                users: milestone + 1
                            }
                        },
                        milestone: milestone
                    }
                });
            });
        }).then(done, done.fail);
    });

    it('should work if milestones are specified in an arbitrary order', function(done) {
        const milestones = [300, 100, 200];
        const orgs = ['o-123', 'o-456', 'o-789'];
        const campaigns = ['cam-123', 'cam-456', 'cam-789'];
        CwrxRequest.prototype.get.and.callFake(options => {
            if (/analytics/.test(options)) {
                const id = options.match(/(cam-\d+)/)[0];
                const views = milestones[campaigns.indexOf(id)] + 1;
                return Promise.resolve([{
                    summary: {
                        users: views
                    }
                }]);
            } else {
                const id = options.qs.org;
                const campaign = campaigns[orgs.indexOf(id)];
                return Promise.resolve([[{
                    id: campaign
                }]]);
            }
        });
        Promise.all(milestones.map((milestone, index) => {
            const event = ld.assign({ }, this.event, {
                data: {
                    org: {
                        id: orgs[index]
                    }
                },
                options: {
                    milestones: milestones
                }
            });
            return this.action(event);
        })).then(() => {
            milestones.map((milestone, index) => {
                expect(rcKinesis.JsonProducer.prototype.produce).toHaveBeenCalledWith({
                    type: 'views_milestone',
                    data: {
                        org: {
                            id: orgs[index]
                        },
                        campaign: {
                            id: campaigns[index]
                        },
                        analytics: {
                            summary: {
                                users: milestone + 1
                            }
                        },
                        milestone: milestone
                    }
                });
            });
        }).then(done, done.fail);
    });
});
