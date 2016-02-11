# -*- mode: ruby -*-
# vi: set ft=ruby :

# Vagrantfile API/syntax version. Don't touch unless you know what you're doing!
VAGRANTFILE_API_VERSION = "2"

Vagrant.configure(VAGRANTFILE_API_VERSION) do |config|
  # Box to build off of
  config.vm.box = "Berkshelf-CentOS-6.3-x86_64-minimal--bigger"
  config.vm.box_url = "https://s3.amazonaws.com/c6.dev/VagrantBoxes/Berkshelf-CentOS-6.3-x86_64-minimal--bigger.box"

  # Create a private network, which allows host-only access to the machine
  # using a specific IP.
  config.vm.network "private_network", ip: "33.33.33.20"
  config.vm.provider :virtualbox do |vb|
    vb.customize ["modifyvm", :id, "--natdnshostresolver1", "on"]
  end

  # Use the default insecure key
  config.ssh.insert_key = false

  # Enable the Berkshelf plugin
  config.berkshelf.enabled = true

  config.omnibus.chef_version = :latest

  # Provision with chef solo
  config.vm.provision "chef_solo" do |chef|
    chef.data_bags_path = "#{ENV['CHEF_REPO']}/data_bags"
    chef.encrypted_data_bag_secret_key_path = "#{ENV['HOME']}/.chef/c6data.pem"
    chef.roles_path = "../cookbooks/watchman/roles"
    chef.environments_path = "../cookbooks/watchman/environments"
    chef.add_role "test"
    chef.environment = "development"
    chef.json = {
        :watchman => {
            :awsAuth => JSON.parse(File.read("#{ENV['HOME']}/.aws.json")),
            :secrets => {
                :email => "testuser",
                :password => "password"
            },
            :rsyslog => {
                :token => "fac240ab-aa03-4430-8966-a474b92773d3",
                :hostname => ENV["USER"],
                :monitor => true
            },
            :deploy => {
                :apps => ["devTimeStreamApplication", "devWatchmanStreamApplication"]
            },
            :devTimeStreamApplication => {
                :mld => {
                    :stream => "devTimeStream"
                }
            },
            :devWatchmanStreamApplication => {
                :mld => {
                    :stream => "devWatchmanStream"
                }
            },
            :app => {
                :cwrx => {
                    :auth => {
                        :endpoint => ":3200/api/auth"
                    },
                    :campaigns => {
                        :endpoint => ":3900/api/campaigns"
                    }
                }
            }
        }
    }
  end
end
