#!/bin/bash

# Output command before executing
set -x

# Exit on error
set -e

REGISTRY="quay.io"

function tag_push() {
  local tag=$1
  docker tag f8toggles-deploy $tag
  docker push $tag
}

# Source environment variables of the jenkins slave
# that might interest this worker.
function load_jenkins_vars() {
  if [ -e "jenkins-env.json" ]; then
    eval "$(./env-toolkit load -f jenkins-env.json DEVSHIFT_TAG_LEN QUAY_USERNAME QUAY_PASSWORD JENKINS_URL GIT_BRANCH GIT_COMMIT BUILD_NUMBER ghprbSourceBranch ghprbActualCommit BUILD_URL ghprbPullId)"
  fi
}

function login() {
  if [ -n "${QUAY_USERNAME}" -a -n "${QUAY_PASSWORD}" ]; then
    docker login -u ${QUAY_USERNAME} -p ${QUAY_PASSWORD} ${REGISTRY}
  else
    echo "Could not login, missing credentials for the registry"
  fi
}

 # We need to disable selinux for now, XXX
/usr/sbin/setenforce 0 || :

# Get all the deps in
yum install -y epel-release && yum install -y nodejs && yum clean all
yum -y install \
   docker \
   make \
   git \
   curl

# run build: lint, unit test
echo 'Run nodejs lint and unit test'
npm install
npm run build

service docker start

load_jenkins_vars
TAG=$(echo $GIT_COMMIT | cut -c1-${DEVSHIFT_TAG_LEN})

login

if [ "$TARGET" = "rhel" ]; then
  docker build -t f8toggles-deploy -f Dockerfile.rhel .

  tag_push ${REGISTRY}/openshiftio/rhel-fabric8-services-fabric8-toggles:$TAG
  tag_push ${REGISTRY}/openshiftio/rhel-fabric8-services-fabric8-toggles:latest
else
  docker build -t f8toggles-deploy -f Dockerfile .

  tag_push ${REGISTRY}/openshiftio/fabric8-services-fabric8-toggles:$TAG
  tag_push ${REGISTRY}/openshiftio/fabric8-services-fabric8-toggles:latest
fi

echo 'CICO: Image pushed, ready to update deployed app'
