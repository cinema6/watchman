'use strict';

var Q = require('q');
var fs = require('fs');
var handlebars = require('handlebars');
var htmlToText = require('html-to-text');
var logger = require('cwrx/lib/logger.js');
var nodemailer = require('nodemailer');
var path = require('path');
var requestUtils = require('cwrx/lib/requestUtils.js');
var sesTransport = require('nodemailer-ses-transport');
var util = require('util');
var resolveURL = require('url').resolve;

var TEMPLATE_DIR = '../../../templates';

var __ut__ = (global.jasmine !== undefined) ? true : false;

var __private__ = {
    /**
    * Loads the specified email template from a file. Resolves with the contents of the file.
    */
    loadTemplate: function(name) {
        var templatePath = path.join(__dirname, TEMPLATE_DIR, name);
        return Q.Promise(function(resolve, reject) {
            fs.readFile(templatePath, {
                encoding: 'utf8'
            }, function(error, data) {
                if(error) {
                    reject(error);
                } else {
                    resolve(data);
                }
            });
        });
    },

    /**
    * Gets the recipient of the email. If the "toSupport" option is true, the recipient will be the
    * configured address of support Otherwise, if the "to" option is specified, its value will be
    * the recipient. Otherwise if there is a user that was provided as data, the email on the user
    * is the recipient. Otherwise if there is a campaign that was provided as data, the owner of
    * the campaign is considered to be the recipient.
    */
    getRecipient: function(data, options, config) {
        var log = logger.getLog();
        return Q.resolve().then(function() {
            if(options.toSupport) {
                return config.emails.supportAddress;
            } else if(options.to) {
                return options.to;
            } else if(data.user && data.user.email) {
                return data.user.email;
            } else if(data.campaign && data.campaign.user) {
                var apiRoot = config.cwrx.api.root;
                var appCreds = config.appCreds;
                var userId = data.campaign.user;
                var userEndpoint = apiRoot + config.cwrx.api.users.endpoint + '/' + userId;
                return requestUtils.makeSignedRequest(appCreds, 'get', {
                    fields: 'email',
                    json: true,
                    url: userEndpoint
                }).then(function(response) {
                    var statusCode = response.response.statusCode;
                    var body = response.body;
                    if(statusCode === 200) {
                        return body.email;
                    } else {
                        log.warn('Error requesting user %1, code: %2 body: %3', userId, statusCode,
                            body);
                        return Q.reject('Error requesting user');
                    }
                });
            } else if (data.org) {
                return requestUtils.makeSignedRequest(config.appCreds, 'get', {
                    qs: { fields: 'email', org: data.org.id, sort: 'created,1' },
                    url: resolveURL(config.cwrx.api.root, config.cwrx.api.users.endpoint)
                }).then(function handleResponse(result) {
                    var response = result.response;
                    var body = result.body;

                    if (response.statusCode !== 200) {
                        throw new Error('Failed to get users for org ' + data.org.id + ': ' + body);
                    }

                    return body[0].email;
                });
            } else {
                return Q.reject('Could not find a recipient');
            }
        });
    },

    /**
    * Gets the subject of the email given an email type.
    */
    getSubject: function(type, data) {
        var campName = data && data.campaign && data.campaign.name;
        var prefix = (data && data.user && data.user.firstName) ? data.user.firstName + ', ' : '';

        switch(type) {
        case 'campaignExpired':
            return 'Your Campaign Has Ended';
        case 'campaignReachedBudget':
            return 'Your Campaign is Out of Budget';
        case 'campaignApproved':
            return 'Reelcontent Campaign Approved';
        case 'campaignUpdateApproved':
            return 'Your Campaign Change Request Has Been Approved';
        case 'campaignRejected':
            return 'Reelcontent Campaign Rejected';
        case 'campaignUpdateRejected':
            return 'Your Campaign Change Request Has Been Rejected';
        case 'newUpdateRequest':
            var submitter = null;
            if (data.user) {
                submitter = data.user.company || (data.user.firstName + ' ' + data.user.lastName);
            } else if (data.application) {
                submitter = data.application.key;
            }
            return 'New update request from ' + submitter + ' for campaign "' + campName + '"';
        case 'paymentMade':
            return 'Your payment has been approved';
        case 'activateAccount':
            switch (data.target) {
            case 'bob':
                return prefix + 'Welcome to Reelcontent Marketing!';
            default:
                return prefix + 'Welcome to Reelcontent';
            }
            return;
        case 'accountWasActivated':
            return prefix + 'Your Reelcontent Account Is Ready To Go';
        case 'passwordChanged':
            return 'Reelcontent Password Change Notice';
        case 'emailChanged':
            return 'Your Email Has Been Changed';
        case 'failedLogins':
            return 'Reelcontent: Multiple-Failed Logins';
        case 'forgotPassword':
            return 'Forgot Your Password?';
        case 'chargePaymentPlanFailure':
            return 'We Hit a Snag';
        case 'campaignActive':
            return campName + ' Is Now Live!';
        case 'campaignSubmitted':
            return 'We\'ve Got It! ' + campName + ' Has Been Submitted for Approval.';
        default:
            return '';
        }
    },

    /**
    * Based on the email type finds and compiles an email template.
    */
    getHtml: function(type, data, emailConfig) {
        var template = null;
        var templateData = null;

        switch(type) {
        case 'campaignExpired':
            template = 'campaignExpired.html';
            templateData = {
                campName: data.campaign.name,
                date: new Date(data.date).toLocaleDateString(),
                dashboardLink: emailConfig.dashboardLink,
                manageLink: emailConfig.manageLink.replace(':campId', data.campaign.id)
            };
            break;
        case 'campaignReachedBudget':
            template = 'campaignOutOfBudget.html';
            templateData = {
                campName: data.campaign.name,
                date: new Date(data.date).toLocaleDateString(),
                dashboardLink: emailConfig.dashboardLink,
                manageLink: emailConfig.manageLink.replace(':campId', data.campaign.id)
            };
            break;
        case 'campaignApproved':
            template = 'campaignApproved.html';
            templateData = {
                campName: data.campaign.name,
                dashboardLink: emailConfig.dashboardLink
            };
            break;
        case 'campaignUpdateApproved':
            template = 'campaignUpdateApproved.html';
            templateData = {
                campName: data.campaign.name,
                dashboardLink: emailConfig.dashboardLink
            };
            break;
        case 'campaignRejected':
            template = 'campaignRejected.html';
            templateData = {
                campName: data.campaign.name,
                dashboardLink: emailConfig.dashboardLink,
                rejectionReason: data.updateRequest.rejectionReason
            };
            break;
        case 'campaignUpdateRejected':
            template = 'campaignUpdateRejected.html';
            templateData = {
                campName: data.campaign.name,
                dashboardLink: emailConfig.dashboardLink,
                rejectionReason: data.updateRequest.rejectionReason
            };
            break;
        case 'newUpdateRequest':
            template = 'newUpdateRequest.html';
            templateData = {
                requester: (data.user && data.user.email) ||
                    (data.application && data.application.key),
                campName: data.campaign.name,
                reviewLink: emailConfig.reviewLink.replace(':campId', data.campaign.id)
            };
            break;
        case 'paymentMade':
            template = 'paymentReceipt.html';
            templateData = {
                contact         : emailConfig.supportAddress,
                amount          : '$' + data.payment.amount.toFixed(2),
                isCreditCard    : data.payment.method.type === 'creditCard',
                method          : data.payment.method,
                date            : new Date(data.payment.createdAt).toLocaleDateString(),
                balance         : '$' + data.balance.toFixed(2),
            };
            break;
        case 'activateAccount':
            var target = emailConfig.activationTargets[data.target || 'selfie'];
            var link = target + ((target.indexOf('?') === -1) ? '?' : '&') +
                'id=' + data.user.id + '&token=' + data.token;
            template = (function() {
                switch (data.target) {
                case 'bob':
                    return 'activateAccount--bob.html';
                default:
                    return 'activateAccount.html';
                }
            }());
            templateData = {
                activationLink: link
            };
            break;
        case 'accountWasActivated':
            template = (function() {
                switch (data.target) {
                case 'bob':
                    return 'accountWasActivated--bob.html';
                default:
                    return 'accountWasActivated.html';
                }
            }());
            templateData = {
                dashboardLink: emailConfig.dashboardLinks[data.target || 'selfie']
            };
            break;
        case 'passwordChanged':
            template = 'passwordChanged.html';
            templateData = {
                contact: emailConfig.supportAddress,
                date: new Date(data.date).toLocaleDateString(),
                time: new Date(data.date).toTimeString()
            };
            break;
        case 'emailChanged':
            template = 'emailChanged.html';
            templateData = {
                contact: emailConfig.supportAddress,
                newEmail: data.newEmail
            };
            if (data.user.email === data.newEmail) {
                templateData.oldEmail = data.oldEmail;
            }
            break;
        case 'failedLogins':
            var targets = emailConfig.passwordResetPages;
            var resetPasswordLink = targets[(data.user.external) ? 'selfie' : 'portal'];
            template = 'failedLogins.html';
            templateData = {
                link: resetPasswordLink
            };
            break;
        case 'forgotPassword':
            var forgotTarget = emailConfig.forgotTargets[data.target];
            var resetLink = forgotTarget + ((forgotTarget.indexOf('?') === -1) ? '?' : '&') +
                'id=' + data.user.id + '&token=' + data.token;
            template = 'passwordReset.html';
            templateData = {
                resetLink: resetLink
            };
            break;
        case 'chargePaymentPlanFailure':
            template = 'chargePaymentPlanFailure.html';
            templateData = {
                contact: emailConfig.supportAddress,
                amount: '$' + data.paymentPlan.price,
                cardType: data.paymentMethod.cardType,
                cardLast4: data.paymentMethod.last4,
                paypalEmail: data.paymentMethod.email
            };
            break;
        case 'campaignActive':
            template = 'campaignActive.html';
            templateData = {
                campName: data.campaign.name,
                dashboardLink: emailConfig.dashboardLink
            };
            break;
        case 'campaignSubmitted':
            template = 'campaignSubmitted.html';
            templateData = {
                campName: data.campaign.name,
                campaignId: data.campaign.id,
                firstName: data.user.firstName
            };
            break;
        default:
            return Q.reject('Could not find a template for ' + type);
        }

        // Load and compile the email template
        return __private__.loadTemplate(template).then(function(fileContents) {
            var compiledTemplate = handlebars.compile(fileContents);
            return compiledTemplate(templateData);
        });
    },

    /**
    * Gets attachments for the email.
    */
    getAttachments: function(files) {
        var log = logger.getLog();
        files.forEach(function(file) {
            file.path = path.join(__dirname, TEMPLATE_DIR + '/assets', file.filename);
        });
        return Q.allSettled(files.map(function(file) {
            return Q.Promise(function(resolve, reject) {
                fs.stat(file.path, function(error, stats) {
                    if(error) {
                        reject(error);
                    } else {
                        resolve(stats.isFile());
                    }
                });
            });
        })).then(function(results) {
            return files.filter(function(file, index) {
                var result = results[index];
                if(result.state === 'fulfilled') {
                    var exists = result.value;
                    if(exists) {
                        return true;
                    } else {
                        log.warn('Attachment file %1 not found', file.path);
                        return false;
                    }
                } else {
                    log.warn('Error checking for attachment file %1: %2', file.path,
                        util.inspect(result.reason));
                    return false;
                }
            });
        });
    }
};

// The action function to be exported
function factory(config) {
    return function action(event) {
        var data = event.data;
        var options = event.options;
        var emailConfig = config.emails;
        var emailType = options.type;

        if(!emailType) {
            return Q.reject('Must specify an email type');
        }

        var emailOptions = {
            from: emailConfig.sender,
            to: __private__.getRecipient(data, options, config),
            subject: __private__.getSubject(emailType, data),
            html: __private__.getHtml(emailType, data, emailConfig),
            text: null,
            attachments: __private__.getAttachments([{
                filename: 'logo.png', cid: 'reelContentLogo'
            }])
        };

        // Ensure all email options have been computed
        return Q.all(Object.keys(emailOptions).map(function(key) {
            var value = emailOptions[key];
            return Q.resolve(value).then(function(newValue) {
                emailOptions[key] = newValue;
            });
        })).then(function() {
            // Add text email option keeping in mind that links may get capitalized
            var text = htmlToText.fromString(emailOptions.html);
            var capsLinks = text.match(/\[HTTPS?:\/\/[^\]]+\]/g);
            (capsLinks || []).forEach(function(link) {
                text = text.replace(link, link.toLowerCase());
            });
            emailOptions.text = text;

            // Send the email
            return Q.Promise(function(resolve, reject) {
                var transport = nodemailer.createTransport(sesTransport());
                transport.sendMail(emailOptions, function(error) {
                    if(error) {
                        reject(error);
                    } else {
                        resolve();
                    }
                });
            });
        });
    };
}

// Expose private functions for unit testing
if(__ut__) {
    factory.__private__ = __private__;
}
module.exports = factory;
