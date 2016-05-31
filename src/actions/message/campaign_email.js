'use strict';

var Q = require('q');
var fs = require('fs');
var handlebars = require('handlebars');
var htmlToText = require('html-to-text');
var ld = require('lodash');
var logger = require('cwrx/lib/logger.js');
var moment = require('moment');
var nodemailer = require('nodemailer');
var path = require('path');
var postmark = require('postmark');
var requestUtils = require('cwrx/lib/requestUtils.js');
var sesTransport = require('nodemailer-ses-transport');
var util = require('util');
var resolveURL = require('url').resolve;

module.exports = function factory(config) {
    var emailConfig = config.emails;
    var postmarkClient = new postmark.Client(config.postmark.key);

    function friendlyName(data) {
        return (data && data.user && data.user.firstName) ? data.user.firstName + ', ' : '';
    }

    function campaignName(data) {
        return data && data.campaign && data.campaign.name;
    }

    function getAttachments(data) {
        return (data.target === 'showcase') ? [
            { filename: 'reelcontent-email-logo-white.png', cid: 'reelContentLogoWhite' },
            { filename: 'facebook-round-icon.png', cid: 'facebookRoundIcon' },
            { filename: 'twitter-round-icon.png', cid: 'twitterRoundIcon' },
            { filename: 'linkedin-round-icon.png', cid: 'linkedinRoundIcon' },
            { filename: 'website-round-icon.png', cid: 'websiteRoundIcon' }
        ] : [
            { filename: 'logo.png', cid: 'reelContentLogo' }
        ];
    }

    /**
    * Schema representing the possible transactional emails that can be sent out using this action.
    * Each key value may be a function in which case its return value will be assigned to the key.
    * The function may optionally also return a promise.
    */
    var transactionalEmails = {
        campaignExpired: {
            subject: 'Your Campaign Has Ended',
            template: 'campaignExpired',
            data: function(data) {
                return {
                    campName       : data.campaign.name,
                    date           : new Date(data.date).toLocaleDateString(),
                    dashboardLink  : emailConfig.dashboardLinks[data.target || 'selfie'],
                    manageLink     : emailConfig.manageLink.replace(':campId', data.campaign.id)
                };
            },
            attachments: getAttachments
        },
        campaignReachedBudget: {
            subject: 'Your Campaign is Out of Budget',
            template: 'campaignOutOfBudget',
            data: function(data) {
                return {
                    campName       : data.campaign.name,
                    date           : new Date(data.date).toLocaleDateString(),
                    dashboardLink  : emailConfig.dashboardLinks[data.target || 'selfie'],
                    manageLink     : emailConfig.manageLink.replace(':campId', data.campaign.id)
                };
            },
            attachments: getAttachments
        },
        campaignApproved: {
            subject: 'Reelcontent Campaign Approved',
            template: 'campaignApproved',
            data: function(data) {
                return {
                    campName       : data.campaign.name,
                    dashboardLink  : emailConfig.dashboardLinks[data.target || 'selfie']
                };
            },
            attachments: getAttachments
        },
        campaignUpdateApproved: {
            subject: 'Your Campaign Change Request Has Been Approved',
            template: 'campaignUpdateApproved',
            data: function(data) {
                return {
                    campName       : data.campaign.name,
                    dashboardLink  : emailConfig.dashboardLinks[data.target || 'selfie']
                };
            },
            attachments: getAttachments
        },
        campaignRejected: {
            subject: 'Reelcontent Campaign Rejected',
            template: 'campaignRejected',
            data: function(data) {
                return {
                    campName         : data.campaign.name,
                    dashboardLink    : emailConfig.dashboardLinks[data.target || 'selfie'],
                    rejectionReason  : data.updateRequest.rejectionReason
                };
            },
            attachments: getAttachments
        },
        campaignUpdateRejected: {
            subject: 'Your Campaign Change Request Has Been Rejected',
            template: 'campaignUpdateRejected',
            data: function(data) {
                return {
                    campName         : data.campaign.name,
                    dashboardLink    : emailConfig.dashboardLinks[data.target || 'selfie'],
                    rejectionReason  : data.updateRequest.rejectionReason
                };
            },
            attachments: getAttachments
        },
        newUpdateRequest: {
            subject: function(data) {
                var submitter = null;

                if (data.user) {
                    submitter = data.user.company || (data.user.firstName + ' ' +
                        data.user.lastName);
                } else if (data.application) {
                    submitter = data.application.key;
                }

                return 'New update request from ' + submitter + ' for campaign "' +
                    campaignName(data) + '"';
            },
            template: 'newUpdateRequest',
            data: function(data) {
                return {
                    requester   : (data.user && data.user.email) ||
                                    (data.application && data.application.key),
                    campName    : data.campaign.name,
                    reviewLink  : emailConfig.reviewLink.replace(':campId', data.campaign.id),
                    user: data.user,
                    application: data.application
                };
            },
            attachments: getAttachments
        },
        paymentMade: {
            subject: 'Your payment has been approved',
            template: function(data) {
                switch (data.target) {
                case 'showcase':
                    return 'paymentReceipt--app';
                default:
                    return 'paymentReceipt';
                }
            },
            data: function(data) {
                return {
                    contact         : emailConfig.supportAddress,
                    amount          : '$' + data.payment.amount.toFixed(2),
                    isCreditCard    : data.payment.method.type === 'creditCard',
                    method          : data.payment.method,
                    date            : new Date(data.payment.createdAt).toLocaleDateString(),
                    balance         : '$' + data.balance.toFixed(2),
                    firstName       : data.user.firstName,
                    billingEndDate  : moment(data.payment.createdAt).add(1, 'month')
                                        .subtract(1, 'day').toDate().toLocaleDateString()
                };
            },
            attachments: getAttachments
        },
        activateAccount: {
            subject: function(data) {
                switch (data.target) {
                case 'showcase':
                    return friendlyName(data) + 'Welcome to Reelcontent Apps';
                default:
                    return friendlyName(data) + 'Welcome to Reelcontent';
                }
            },
            template: function(data) {
                switch (data.target) {
                case 'showcase':
                    return 'activateAccount--app';
                default:
                    return 'activateAccount';
                }
            },
            data: function(data) {
                var target = emailConfig.activationTargets[data.target || 'selfie'];
                var link = target + ((target.indexOf('?') === -1) ? '?' : '&') +
                    'id=' + data.user.id + '&token=' + data.token;

                return {
                    activationLink  : link,
                    firstName       : data.user.firstName,
                };
            },
            attachments: getAttachments
        },
        accountWasActivated: {
            subject: function(data) {
                return friendlyName(data) + 'Your Reelcontent Account Is Ready To Go';
            },
            template: function(data) {
                switch (data.target) {
                case 'showcase':
                    return 'accountWasActivated--app';
                default:
                    return 'accountWasActivated';
                }
            },
            data: function(data) {
                return {
                    dashboardLink  : emailConfig.dashboardLinks[data.target || 'selfie'],
                    firstName      : data.user.firstName,
                };
            },
            attachments: getAttachments
        },
        passwordChanged: {
            subject: 'Reelcontent Password Change Notice',
            template: function(data) {
                switch (data.target) {
                case 'showcase':
                    return 'passwordChanged--app';
                default:
                    return 'passwordChanged';
                }
            },
            data: function(data) {
                return {
                    contact        : emailConfig.supportAddress,
                    dashboardLink  : emailConfig.dashboardLinks[data.target || 'selfie'],
                    date           : new Date(data.date).toLocaleDateString(),
                    firstName      : data.user.firstName,
                    time           : new Date(data.date).toTimeString()
                };
            },
            attachments: getAttachments
        },
        emailChanged: {
            subject: 'Your Email Has Been Changed',
            template: function(data) {
                switch (data.target) {
                case 'showcase':
                    return 'emailChanged--app';
                default:
                    return 'emailChanged';
                }
            },
            data: function(data) {
                var result = {
                    contact    : emailConfig.supportAddress,
                    newEmail   : data.newEmail,
                    firstName  : data.user.firstName
                };

                if (data.user.email === data.newEmail || data.target === 'showcase') {
                    result.oldEmail = data.oldEmail;
                }

                return result;
            },
            attachments: getAttachments
        },
        failedLogins: {
            subject: 'Reelcontent: Multiple-Failed Logins',
            template: function(data) {
                switch (data.target) {
                case 'showcase':
                    return 'failedLogins--app';
                default:
                    return 'failedLogins';
                }
            },
            data: function(data) {
                var resetPasswordLink = emailConfig.passwordResetPages[data.target];

                return {
                    contact    : emailConfig.supportAddress,
                    firstName  : data.user.firstName,
                    link       : resetPasswordLink
                };
            },
            attachments: getAttachments
        },
        forgotPassword: {
            subject: 'Forgot Your Password?',
            template: function(data) {
                switch (data.target) {
                case 'showcase':
                    return 'passwordReset--app';
                default:
                    return 'passwordReset';
                }
            },
            data: function(data) {
                var forgotTarget = emailConfig.forgotTargets[data.target];
                var resetLink = forgotTarget + ((forgotTarget.indexOf('?') === -1) ? '?' : '&') +
                    'id=' + data.user.id + '&token=' + data.token;

                return {
                    firstName  : data.user.firstName,
                    resetLink  : resetLink
                };
            },
            attachments: getAttachments
        },
        chargePaymentPlanFailure: {
            subject: 'We Hit a Snag',
            template: 'chargePaymentPlanFailure',
            data: function(data) {
                return {
                    contact      : emailConfig.supportAddress,
                    amount       : '$' + data.paymentPlan.price,
                    cardType     : data.paymentMethod.cardType,
                    cardLast4    : data.paymentMethod.last4,
                    paypalEmail  : data.paymentMethod.email
                };
            },
            attachments: getAttachments
        },
        campaignActive: {
            subject: function(data) {
                return campaignName(data) + ' Is Now Live!';
            },
            template: 'campaignActive',
            data: function(data) {
                return {
                    campName       : data.campaign.name,
                    dashboardLink  : emailConfig.dashboardLinks[data.target || 'selfie']
                };
            },
            attachments: getAttachments
        },
        campaignSubmitted: {
            subject: function(data) {
                return 'We\'ve Got It! ' + campaignName(data) + ' Has Been Submitted for Approval.';
            },
            template: 'campaignSubmitted',
            data: function(data) {
                var previewLink = emailConfig.previewLink.replace(':campId', data.campaign.id);

                return {
                    campName     : data.campaign.name,
                    firstName    : data.user.firstName,
                    previewLink  : previewLink
                };
            },
            attachments: getAttachments
        },
        initializedShowcaseCampaign: {
            subject: function(data) {
                return 'New Showcase Campaign Started: ' + campaignName(data);
            },
            template: 'initializedShowcaseCampaign',
            data: function(data) {
                return Q.when().then(function() {
                    var advertisersEndpoint = resolveURL(
                        config.cwrx.api.root,
                        config.cwrx.api.advertisers.endpoint
                    );
                    var campaign = data.campaign;
                    var externalCampaignId = campaign.externalCampaigns.beeswax.externalId;

                    return requestUtils.makeSignedRequest(config.appCreds, 'get', {
                        url: advertisersEndpoint + '/' + campaign.advertiserId,
                        json: true
                    }).then(function(data) {
                        var response = data.response;
                        var advertiser = data.body;

                        if (!/^2/.test(response.statusCode)) {
                            throw new Error(
                                'Failed to GET advertiser(' + campaign.advertiserId + '): ' +
                                '[' + response.statusCode +']: ' + data.body
                            );
                        }

                        return {
                            beeswaxCampaignId   : externalCampaignId,
                            beeswaxCampaignURI  : emailConfig.beeswax.campaignLink
                                .replace('{{advertiserId}}', advertiser.beeswaxIds.advertiser)
                                .replace('{{campaignId}}', externalCampaignId),
                            campName            : campaign.name
                        };
                    });
                });
            },
            attachments: getAttachments
        }
    };

    /* The action function */
    return function action(event) {
        var data = event.data;
        var options = event.options;
        var emailType = options.type;
        var provider = options.provider || 'postmark';

        /* Evaluates any functions in the transactional email template. */
        function compileEmailOptions(options) {
            var keys = Object.keys(options);
            return Q.all(keys.map(function(key) {
                var value = options[key];
                if(ld.isFunction(value)) {
                    return value(data);
                } else {
                    return value;
                }
            })).then(function(results) {
                var result = { };
                keys.forEach(function(key, index) {
                    result[key] = results[index];
                });
                return result;
            });
        }

        /* Returns attachments which exist and warns of those that do not. */
        function validAttachments(email) {
            var attachments = email.attachments;
            var log = logger.getLog();

            return Q.allSettled(attachments.map(function(attachment) {
                return Q.Promise(function(resolve, reject) {
                    var filepath = path.join(__dirname, '../../../templates/assets',
                        attachment.filename);
                    fs.stat(filepath, function(error, stats) {
                        if(error) {
                            reject(error);
                        } else {
                            resolve(stats.isFile());
                        }
                    });
                });
            })).then(function(results) {
                return attachments.filter(function(attachment, index) {
                    var result = results[index];
                    if(result.state === 'fulfilled') {
                        var exists = result.value;
                        if(exists) {
                            return true;
                        } else {
                            log.warn('Attachment file %1 not found', attachment.filename);
                            return false;
                        }
                    } else {
                        log.warn('Error checking for attachment file %1: %2', attachment.filename,
                            util.inspect(result.reason));
                        return false;
                    }
                });
            });
        }

        /**
        * Gets the recipient of the email. If the "toSupport" option is true, the recipient will be
        * the configured address of support Otherwise, if the "to" option is specified, its value
        * will be the recipient. Otherwise if there is a user that was provided as data, the email
        * on the user is the recipient. Otherwise if there is a campaign that was provided as data,
        * the owner of the campaign is considered to be the recipient.
        */
        function getRecipient(data, options) {
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
                            log.warn('Error requesting user %1, code: %2 body: %3', userId,
                                statusCode, body);
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
                            throw new Error('Failed to get users for org ' + data.org.id + ': ' +
                                body);
                        }

                        return body[0].email;
                    });
                } else {
                    return Q.reject('Could not find a recipient');
                }
            });
        }

        /* Knows how to send a transactional emails using ses. */
        function sesAdapter(email) {
            var sesEmail = ld.pick(email, ['to', 'from', 'subject']);
            var templatePath = path.join(__dirname, '../../../templates', email.template + '.html');

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
            }).then(function(fileContents) {
                var compiledTemplate = handlebars.compile(fileContents);
                var html = compiledTemplate(email.data);
                var text = htmlToText.fromString(html);
                var capsLinks = text.match(/\[HTTPS?:\/\/[^\]]+\]/g);
                (capsLinks || []).forEach(function(link) {
                    text = text.replace(link, link.toLowerCase());
                });

                sesEmail.html = html;
                sesEmail.text = text;
                sesEmail.attachments = email.attachments;
                sesEmail.attachments.forEach(function(attachment) {
                    attachment.path = path.join(__dirname, '../../../templates/assets',
                        attachment.filename);
                });

                return Q.Promise(function(resolve, reject) {
                    var transport = nodemailer.createTransport(sesTransport());
                    transport.sendMail(sesEmail, function(error) {
                        if(error) {
                            reject(error);
                        } else {
                            resolve();
                        }
                    });
                });
            });
        }

        /* Knows how to send a transaction emails using postmark. */
        function postmarkAdapter(email) {
            var template = email.template;

            return Q.all(email.attachments.map(function(attachment) {
                return Q.Promise(function(resolve, reject) {
                    var assetPath = path.join(__dirname, '../../../templates/assets',
                        attachment.filename);
                    fs.readFile(assetPath, {
                        encoding: 'base64'
                    }, function(error, data) {
                        if(error) {
                            reject(error);
                        } else {
                            resolve(data);
                        }
                    });
                });
            })).then(function(files) {
                return Q.Promise(function(resolve, reject) {
                    return postmarkClient.sendEmailWithTemplate({
                        TemplateId: config.postmark.templates[template],
                        TemplateModel: email.data,
                        InlineCss: true,
                        From: email.from,
                        To: email.to,
                        Tag: template,
                        TrackOpens: true,
                        Attachments: email.attachments.map(function(attachment, index) {
                            return {
                                Name: attachment.filename,
                                Content: files[index],
                                ContentType: 'image/png',
                                ContentID: 'cid:' + attachment.cid
                            };
                        })
                    }, function(error, response) {
                        if(error) {
                            reject(error);
                        } else {
                            resolve(response);
                        }
                    });
                });
            });
        }

        if(!emailType || !transactionalEmails[emailType]) {
            return Q.reject('Must specify a valid email type');
        }

        return compileEmailOptions(transactionalEmails[emailType]).then(function(email) {
            return getRecipient(data, options).then(function(recipient) {
                email.to = recipient;
                email.from = emailConfig.sender;

                return validAttachments(email);
            }).then(function(attachments) {
                email.attachments = attachments;

                switch(provider) {
                case 'ses':
                    return sesAdapter(email);
                case 'postmark':
                    return postmarkAdapter(email);
                default:
                    throw new Error('Unrecognized provider ' + provider);
                }
            });
        });
    };
};
