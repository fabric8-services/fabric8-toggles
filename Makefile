PROJECT_NAME = fabric8-toggles
REGISTRY_IMAGE = ${PROJECT_NAME}
REGISTRY_URI = push.registry.devshift.net
REGISTRY_NS = fabric8-services
REGISTRY_URL = ${REGISTRY_URI}/${REGISTRY_NS}/${REGISTRY_IMAGE}
VENDOR_DIR=node_modules
TOGGLES_ORG?=172.30.1.1:5000/fabric8
#TOGGLES_ORG?=${REGISTRY_URI}/${REGISTRY_NS}
FABRIC8_PROJECT=fabric8
MINISHIFT_IP := $(shell minishift ip)
OC_USERNAME := developer
OC_PASSWORD := developer

.DEFAULT_GOAL := help

all: clean-minishift push-minishift deploy-minishift ## Compiles binary and runs format and style checks


.PHONY: login-dev
login-dev:
	echo "logging on $(MINISHIFT_IP) with $(OC_USERNAME) account..."
	@oc login --insecure-skip-tls-verify=true https://$(MINISHIFT_IP):8443 -u $(OC_USERNAME) -p $(OC_PASSWORD) 1>/dev/null
	@oc whoami -t > tmp/developer.txt


## the '-' at the beginning of the line will ignore failure of `oc project` if the project already exists.
create-project:
	@-oc new-project ${FABRIC8_PROJECT}
	oc project ${FABRIC8_PROJECT}

.PHONY: push-minishift
push-minishift: login-dev create-project
	eval $$(minishift docker-env) && docker login -u developer -p $(shell oc whoami -t) $(shell minishift openshift registry) && docker build -t $(REGISTRY_URL) -f Dockerfile .
	eval $$(minishift docker-env) && docker login -u developer -p $(shell oc whoami -t) $(shell minishift openshift registry) && docker tag ${REGISTRY_URI}/${REGISTRY_NS}/${REGISTRY_IMAGE}  $(shell minishift openshift registry)/${FABRIC8_PROJECT}/${REGISTRY_IMAGE}:latest
	eval $$(minishift docker-env) && docker login -u developer -p $(shell oc whoami -t) $(shell minishift openshift registry) && docker push $(shell minishift openshift registry)/${FABRIC8_PROJECT}/${REGISTRY_IMAGE}:latest

.PHONY: deploy-minishift
deploy-minishift: login-dev create-project push-minishift ## deploy toggles server on minishift
	curl https://raw.githubusercontent.com/xcoulon/fabric8-minishift/master/toggles-db.yml -o toggles-db.yml
	kedge apply -f toggles-db.yml
	curl https://raw.githubusercontent.com/xcoulon/fabric8-minishift/master/toggles.yml -o toggles.yml
	TOGGLES_ORG=$(TOGGLES_ORG) GITHUB_CLIENT_ID=$(GITHUB_CLIENT_ID) \
	  GITHUB_CLIENT_SECRET=$(GITHUB_CLIENT_SECRET) \
	  GITHUB_CALLBACK_URL=$(GITHUB_CALLBACK_URL) TOGGLES_CONTEXT=$(TOGGLES_CONTEXT) \
	  GITHUB_ORG=$(GITHUB_ORG) GITHUB_TEAM=$(GITHUB_TEAM) kedge apply -f toggles.yml

.PHONY: clean-minishift
clean-minishift: login-dev ## removes the fabric8 project on Minishift
	oc project fabric8 && oc delete project fabric8
	rm -rf toggles.yml toggles-db.yml

.PHONY: help
help: ## Prints this help
	@grep -E '^[^.]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-40s\033[0m %s\n", $$1, $$2}'








