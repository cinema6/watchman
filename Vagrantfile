# -*- mode: ruby -*-
# vi: set ft=ruby :

# Vagrantfile API/syntax version. Don't touch unless you know what you're doing!
VAGRANTFILE_API_VERSION = "2"

Vagrant.configure(VAGRANTFILE_API_VERSION) do |config|
  # Box to build off of
  config.vm.box = "Reelcontent-CentOS-6.3-x86_64-1.0.0.box"
  config.vm.box_url = "https://s3.amazonaws.com/c6.dev/VagrantBoxes/Reelcontent-CentOS-6.3-x86_64-1.0.0.box"

  # Create a private network, which allows host-only access to the machine
  # using a specific IP.
  config.vm.hostname = "watchman-development"
  config.vm.network "private_network", ip: "33.33.33.20"
  config.vm.provider :virtualbox do |vb|
    vb.customize ["modifyvm", :id, "--natdnshostresolver1", "on"]
    vb.memory = 1024
  end

  # Use the default insecure key
  config.ssh.insert_key = false

  # Enable the Berkshelf plugin
  config.berkshelf.enabled = true

  # The version of chef that we use on our servers
  config.omnibus.chef_version = '11.10.4'

  # Provision with chef solo
  config.vm.provision "chef_solo" do |chef|
    watchmanUser = ENV["WATCHMAN_USER"] || ENV["USER"] || "anon"

    chef.data_bags_path = "#{ENV['CHEF_REPO']}/data_bags"
    chef.encrypted_data_bag_secret_key_path = "#{ENV['HOME']}/.chef/c6data.pem"
    chef.environments_path = "./environments"
    chef.environment = "development"
    chef.run_list = [
        'recipe[watchman]'
    ]
    chef.json = {
        :c6env => {
            :npm => {
                :fileCache => {
                    :enabled => true
                }
            }
        },
        :watchman => {
            :awsAuth => JSON.parse(File.read("#{ENV['HOME']}/.aws.json")),
            :rsyslog => {
                :hostname => watchmanUser
            },
            :devTimeStreamApplication => {
                :config => {
                    :kinesis => {
                        :producer => {
                            :stream => "devWatchmanStream-" + watchmanUser
                        }
                    }
                },
                :mld => {
                    :stream => "devTimeStream-" + watchmanUser,
                    :table => "devTimeStreamApplication-" + watchmanUser
                }
            },
            :devWatchmanStreamApplication => {
                :config => {
                    :kinesis => {
                        :producer => {
                            :stream => "devWatchmanStream-" + watchmanUser
                        }
                    }
                },
                :mld => {
                    :stream => "devWatchmanStream-" + watchmanUser,
                    :table => "devWatchmanStreamApplication-" + watchmanUser
                }
            },
            :devCwrxStreamApplication => {
                :config => {
                    :kinesis => {
                        :producer => {
                            :stream => "devWatchmanStream-" + watchmanUser
                        }
                    }
                },
                :mld => {
                    :stream => "devCwrxStream-" + watchmanUser,
                    :table => "devCwrxStreamApplication-" + watchmanUser
                }
            }
        }
    }
  end
end
