'use strict';

var JsonProducer = require('../../src/producers/JsonProducer.js');
var Q = require('q');
var testUtils = require('cwrx/test/e2e/testUtils.js');

var CWRX_STREAM = process.env.cwrxStream;

describe('cwrxStream', function() {
    var producer;
    var mailman;
    var mailman2;
    var mockCampaign;
    var mockUser;
    var mockUpdateRequest;

    beforeAll(function(done) {
        mailman = new testUtils.Mailman();
        mailman2 = new testUtils.Mailman({ user: 'c6e2eTester2@gmail.com' });
        mailman.on('error', function(error) { throw new Error(error); });
        mailman2.on('error', function(error) { throw new Error(error); });
        Q.all([mailman, mailman2].map(function(mail) {
            return mail.start();
        })).then(done, done.fail);
    });

    beforeEach(function() {
        jasmine.DEFAULT_TIMEOUT_INTERVAL = 30000;
        producer = new JsonProducer(CWRX_STREAM, { region: 'us-east-1' });
        mockCampaign = {
            id: 'c-123',
            name: 'Cooltastic Campaign'
        };
        mockUser = {
            company: 'Evil Corp',
            email: 'c6e2etester@gmail.com',
            id: 'u-123'
        };
        mockUpdateRequest = {
            rejectionReason: 'your campaign is bad'
        };
    });

    afterEach(function() {
        mailman.removeAllListeners();
        mailman2.removeAllListeners();
    });

    afterAll(function() {
        mailman.stop();
        mailman2.stop();
    });

    describe('when a campaignStateChange event occurs', function() {
        describe('when an active campaign expires', function() {
            beforeEach(function(done) {
                producer.produce({
                    type: 'campaignStateChange',
                    data: {
                        previousState: 'active',
                        currentState: 'expired',
                        campaign: mockCampaign,
                        user: mockUser,
                        date: new Date()
                    }
                }).then(done, done.fail);
            });

            it('should send a campaign expired email', function(done) {
                mailman.once('Your Campaign Has Ended', function(msg) {
                    expect(msg.from[0].address.toLowerCase()).toBe(
                        'no-reply@reelcontent.com');
                    expect(msg.to[0].address.toLowerCase()).toBe('c6e2etester@gmail.com');
                    var regex = new RegExp('Your\\s*campaign.*Cooltastic Campaign' +
                        '.*\\s*reached\\s*its\\s*end\\s*date');
                    expect(msg.text).toMatch(regex);
                    expect(msg.html).toMatch(regex);
                    expect((new Date() - msg.date)).toBeLessThan(30000);
                    done();
                });
            });
        });

        describe('when a paused campaign expires', function() {
            beforeEach(function(done) {
                producer.produce({
                    type: 'campaignStateChange',
                    data: {
                        previousState: 'paused',
                        currentState: 'expired',
                        campaign: mockCampaign,
                        user: mockUser,
                        date: new Date()
                    }
                }).then(done, done.fail);
            });

            it('should send a campaign expired email', function(done) {
                mailman.once('Your Campaign Has Ended', function(msg) {
                    expect(msg.from[0].address.toLowerCase()).toBe(
                        'no-reply@reelcontent.com');
                    expect(msg.to[0].address.toLowerCase()).toBe('c6e2etester@gmail.com');
                    var regex = new RegExp('Your\\s*campaign.*Cooltastic Campaign' +
                        '.*\\s*reached\\s*its\\s*end\\s*date');
                    expect(msg.text).toMatch(regex);
                    expect(msg.html).toMatch(regex);
                    expect((new Date() - msg.date)).toBeLessThan(30000);
                    done();
                });
            });
        });

        describe('when an out of budget campaign expired', function() {
            beforeEach(function(done) {
                producer.produce({
                    type: 'campaignStateChange',
                    data: {
                        previousState: 'outOfBudget',
                        currentState: 'expired',
                        campaign: mockCampaign,
                        user: mockUser,
                        date: new Date()
                    }
                }).then(done, done.fail);
            });

            it('should not send an email', function(done) {
                mailman.once('Your Campaign Has Ended', function() {
                    done.fail();
                });
                setTimeout(function() {
                    done();
                }, 10000);
            });
        });

        describe('when a campaign transitions to an outOfBudget state', function() {
            beforeEach(function(done) {
                producer.produce({
                    type: 'campaignStateChange',
                    data: {
                        previousState: 'active',
                        currentState: 'outOfBudget',
                        campaign: mockCampaign,
                        user: mockUser,
                        date: new Date()
                    }
                }).then(done, done.fail);
            });

            it('should send a campaign reached budget email', function(done) {
                mailman.once('Your Campaign is Out of Budget', function(msg) {
                    expect(msg.from[0].address.toLowerCase()).toBe(
                        'no-reply@reelcontent.com');
                    expect(msg.to[0].address.toLowerCase()).toBe('c6e2etester@gmail.com');
                    var regex = new RegExp('Your\\s*campaign.*Cooltastic Campaign' +
                        '.*is\\s*out\\s*of\\s*budget');
                    expect(msg.text).toMatch(regex);
                    expect(msg.html).toMatch(regex);
                    expect((new Date() - msg.date)).toBeLessThan(30000);
                    done();
                });
            });
        });
    });

    it('should send an email when a campaign has been approved', function(done) {
        producer.produce({
            type: 'campaignApproved',
            data: {
                campaign: mockCampaign,
                user: mockUser
            }
        }).then(function() {
            mailman.once('Reelcontent Campaign Approved', function(msg) {
                expect(msg.from[0].address.toLowerCase()).toBe('no-reply@reelcontent.com');
                expect(msg.to[0].address.toLowerCase()).toBe('c6e2etester@gmail.com');
                var regex = new RegExp(
                    'Your\\s*campaign.*Cooltastic Campaign.*has\\s*been\\s*approved');
                expect(msg.text).toMatch(regex);
                expect(msg.html).toMatch(regex);
                expect((new Date() - msg.date)).toBeLessThan(30000);
                done();
            });
        }).catch(done.fail);
    });

    it('should send an email when a campaign update request has been approved', function(done) {
        producer.produce({
            type: 'campaignUpdateApproved',
            data: {
                campaign: mockCampaign,
                user: mockUser
            }
        }).then(function() {
            mailman.once('Your Campaign Change Request Has Been Approved', function(msg) {
                expect(msg.from[0].address.toLowerCase()).toBe('no-reply@reelcontent.com');
                expect(msg.to[0].address.toLowerCase()).toBe('c6e2etester@gmail.com');
                var regex = new RegExp('Your\\s*change\\s*request\\s*to\\s*campaign.*' +
                    'Cooltastic Campaign.*has\\s*been\\s*approved');
                expect(msg.text).toMatch(regex);
                expect(msg.html).toMatch(regex);
                expect((new Date() - msg.date)).toBeLessThan(30000);
                done();
            });
        }).catch(done.fail);
    });

    it('should send an email when a campaign has been rejected', function(done) {
        producer.produce({
            type: 'campaignRejected',
            data: {
                campaign: mockCampaign,
                user: mockUser,
                updateRequest: mockUpdateRequest
            }
        }).then(function() {
            mailman.once('Reelcontent Campaign Rejected', function(msg) {
                expect(msg.from[0].address.toLowerCase()).toBe('no-reply@reelcontent.com');
                expect(msg.to[0].address.toLowerCase()).toBe('c6e2etester@gmail.com');
                [
                    new RegExp('Your\\s*campaign.*Cooltastic Campaign.*has\\s*been\\s*rejected'),
                    new RegExp('your campaign is bad')
                ].forEach(function(regex) {
                    expect(msg.text).toMatch(regex);
                    expect(msg.html).toMatch(regex);
                });
                expect((new Date() - msg.date)).toBeLessThan(30000);
                done();
            });
        }).catch(done.fail);
    });

    it('should send an email when a campaign udpate request has been rejected', function(done) {
        producer.produce({
            type: 'campaignUpdateRejected',
            data: {
                campaign: mockCampaign,
                user: mockUser,
                updateRequest: mockUpdateRequest
            }
        }).then(function() {
            mailman.once('Your Campaign Change Request Has Been Rejected', function(msg) {
                expect(msg.from[0].address.toLowerCase()).toBe('no-reply@reelcontent.com');
                expect(msg.to[0].address.toLowerCase()).toBe('c6e2etester@gmail.com');
                [
                    new RegExp('Your\\s*change\\s*request\\s*to\\s*campaign.*' +
                        'Cooltastic Campaign.*has\\s*been\\s*rejected'),
                    new RegExp('your campaign is bad')
                ].forEach(function(regex) {
                    expect(msg.text).toMatch(regex);
                    expect(msg.html).toMatch(regex);
                });
                expect((new Date() - msg.date)).toBeLessThan(30000);
                done();
            });
        }).catch(done.fail);
    });

    it('should send an email when there is a new update request', function(done) {
        producer.produce({
            type: 'newUpdateRequest',
            data: {
                campaign: mockCampaign,
                user: mockUser
            }
        }).then(function() {
            mailman.once('New update request from Evil Corp for campaign "Cooltastic Campaign"',
                    function(msg) {
                expect(msg.from[0].address.toLowerCase()).toBe('no-reply@reelcontent.com');
                expect(msg.to[0].address.toLowerCase()).toBe('c6e2etester@gmail.com');
                [
                    new RegExp('created\\s*by\\s*c6e2etester@gmail.com\\s*for\\s*campaign.*' +
                        'Cooltastic Campaign'),
                    new RegExp('review\\s*the\\s*campaign.*\\s*http.*c-123\/admin')
                ].forEach(function(regex) {
                    expect(msg.text).toMatch(regex);
                    expect(msg.html).toMatch(regex);
                });
                expect((new Date() - msg.date)).toBeLessThan(30000);
                done();
            });
        }).catch(done.fail);
    });

    it('should send an activation email when a new user account has been created', function(done) {
        producer.produce({
            type: 'accountCreated',
            data: {
                token: 'secret-token',
                user: mockUser
            }
        }).then(function() {
            mailman.once('Welcome to Reelcontent Video Ads!',
                    function(msg) {
                expect(msg.from[0].address.toLowerCase()).toBe('no-reply@reelcontent.com');
                expect(msg.to[0].address.toLowerCase()).toBe('c6e2etester@gmail.com');
                var regex = /https?:\/\/.+id.+u-123.+token.+secret-token/;
                expect(msg.text).toMatch(regex);
                expect(msg.html).toMatch(regex);
                expect((new Date() - msg.date)).toBeLessThan(30000);
                done();
            });
        }).catch(done.fail);
    });

    it('should send an activation email when a new bob account has been created', function(done) {
        producer.produce({
            type: 'accountCreated',
            data: {
                token: 'secret-token',
                user: mockUser,
                target: 'bob'
            }
        }).then(function() {
            mailman.once('Welcome to Reelcontent Marketing!',
                    function(msg) {
                expect(msg.from[0].address.toLowerCase()).toBe('no-reply@reelcontent.com');
                expect(msg.to[0].address.toLowerCase()).toBe('c6e2etester@gmail.com');
                var regex = /https?:\/\/.+id.+u-123.+token.+secret-token/;
                expect(msg.text).toMatch(regex);
                expect(msg.html).toMatch(regex);
                expect((new Date() - msg.date)).toBeLessThan(30000);
                expect(msg.text).toContain('Welcome to Reelcontent Marketing!');
                done();
            });
        }).catch(done.fail);
    });

    it('should send an email notifying the user that their account has been activated',
            function(done) {
        producer.produce({
            type: 'accountActivated',
            data: {
                user: mockUser
            }
        }).then(function() {
            mailman.once('Your Account is Now Active',
                    function(msg) {
                expect(msg.from[0].address.toLowerCase()).toBe('no-reply@reelcontent.com');
                expect(msg.to[0].address.toLowerCase()).toBe('c6e2etester@gmail.com');
                var regex = /account\s*is\s*now\s*active/;
                expect(msg.text).toMatch(regex);
                expect(msg.html).toMatch(regex);
                expect((new Date() - msg.date)).toBeLessThan(30000);
                done();
            });
        }).catch(done.fail);
    });

    it('should send an email notifying the user that their bob account has been activated',
            function(done) {
        producer.produce({
            type: 'accountActivated',
            data: {
                user: mockUser,
                target: 'bob'
            }
        }).then(function() {
            mailman.once('Your Account is Now Active',
                    function(msg) {
                expect(msg.from[0].address.toLowerCase()).toBe('no-reply@reelcontent.com');
                expect(msg.to[0].address.toLowerCase()).toBe('c6e2etester@gmail.com');
                var regex = /account\s*is\s*now\s*active/;
                expect(msg.text).toMatch(regex);
                expect(msg.html).toMatch(regex);
                expect(msg.text).toContain('ADD MY FIRST PRODUCT');
                expect((new Date() - msg.date)).toBeLessThan(30000);
                done();
            });
        }).catch(done.fail);
    });

    it('should send an email notifying the user that their password has been changed',
            function(done) {
        producer.produce({
            type: 'passwordChanged',
            data: {
                date: new Date(),
                user: mockUser
            }
        }).then(function() {
            mailman.once('Reelcontent Password Change Notice',
                    function(msg) {
                expect(msg.from[0].address.toLowerCase()).toBe('no-reply@reelcontent.com');
                expect(msg.to[0].address.toLowerCase()).toBe('c6e2etester@gmail.com');
                var regex = /password\s*was\s*changed\s*on.*at.*/;
                expect(msg.text).toMatch(regex);
                expect(msg.html).toMatch(regex);
                expect((new Date() - msg.date)).toBeLessThan(30000);
                done();
            });
        }).catch(done.fail);
    });

    describe('sending an email to notify of a password change', function() {
        it('should be able to notify the old email address', function(done) {
            producer.produce({
                type: 'emailChanged',
                data: {
                    user: mockUser,
                    oldEmail: 'c6e2etester@gmail.com',
                    newEmail: 'c6e2etester2@gmail.com'
                }
            }).then(function() {
                mailman.once('Your Email Has Been Changed', function(msg) {
                    expect(msg.from[0].address.toLowerCase()).toBe('no-reply@reelcontent.com');
                    expect(msg.to[0].address.toLowerCase()).toBe('c6e2etester@gmail.com');
                    var regex = /c6e2etester2@gmail.com/;
                    expect(msg.text).toMatch(regex);
                    expect(msg.html).toMatch(regex);
                    expect((new Date() - msg.date)).toBeLessThan(30000);
                    done();
                });
            }).catch(done.fail);
        });

        it('should be able to notify the new email address', function(done) {
            mockUser.email = 'c6e2etester2@gmail.com';
            producer.produce({
                type: 'emailChanged',
                data: {
                    user: mockUser,
                    oldEmail: 'c6e2etester@gmail.com',
                    newEmail: 'c6e2etester2@gmail.com'
                }
            }).then(function() {
                mailman2.once('Your Email Has Been Changed', function(msg) {
                    expect(msg.from[0].address.toLowerCase()).toBe('no-reply@reelcontent.com');
                    expect(msg.to[0].address.toLowerCase()).toBe('c6e2etester2@gmail.com');
                    [
                        /c6e2etester@gmail.com/,
                        /c6e2etester2@gmail.com/
                    ].forEach(function(regex) {
                        expect(msg.text).toMatch(regex);
                        expect(msg.html).toMatch(regex);
                    });
                    expect((new Date() - msg.date)).toBeLessThan(30000);
                    done();
                });
            }).catch(done.fail);
        });
    });

    it('should be able to send an email after multiple failed password attempts', function(done) {
        producer.produce({
            type: 'failedLogins',
            data: {
                user: mockUser
            }
        }).then(function() {
            mailman.once('Reelcontent: Multiple-Failed Logins', function(msg) {
                expect(msg.from[0].address.toLowerCase()).toBe('no-reply@reelcontent.com');
                expect(msg.to[0].address.toLowerCase()).toBe('c6e2etester@gmail.com');
                var regex = /consecutive\s*failed\s*login\s*attempts/;
                expect(msg.text).toMatch(regex);
                expect(msg.html).toMatch(regex);
                expect((new Date() - msg.date)).toBeLessThan(30000);
                done();
            });
        }).catch(done.fail);
    });

    it('should be able to send an email when the user has requested a password reset',
            function(done) {
        producer.produce({
            type: 'forgotPassword',
            data: {
                target: 'selfie',
                token: 'secret-token',
                user: mockUser
            }
        }).then(function() {
            mailman.once('Forgot Your Password?', function(msg) {
                expect(msg.from[0].address.toLowerCase()).toBe('no-reply@reelcontent.com');
                expect(msg.to[0].address.toLowerCase()).toBe('c6e2etester@gmail.com');
                var regex = /https?:\/\/.+id.+u-123.+token.+secret-token/;
                expect(msg.text).toMatch(regex);
                expect(msg.html).toMatch(regex);
                expect((new Date() - msg.date)).toBeLessThan(30000);
                done();
            });
        }).catch(done.fail);
    });
});
