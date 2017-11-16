FROM centos:7
LABEL maintainer="Aslak Knutsen <aslak@redhat.com>"

ENV F8_USER_NAME=fabric8
RUN useradd  -s /bin/bash ${F8_USER_NAME}

RUN yum install -y epel-release && yum install -y nodejs && yum clean all 

WORKDIR /home/${F8_USER_NAME}
COPY package.json .
RUN npm install --production

COPY . .

RUN chmod -R +777 /home/${F8_USER_NAME}

# Install little pcp pmcd server for metrics collection
# would prefer only pmcd, and not the /bin/pm*tools etc.
COPY pcp.repo /etc/yum.repos.d/pcp.repo
RUN yum install -y pcp && yum clean all && \
    mkdir -p /etc/pcp /var/run/pcp /var/lib/pcp /var/log/pcp  && \
    chgrp -R root /etc/pcp /var/run/pcp /var/lib/pcp /var/log/pcp && \
    chmod -R g+rwX /etc/pcp /var/run/pcp /var/lib/pcp /var/log/pcp
COPY ./node+pmcd.sh /node+pmcd.sh
EXPOSE 44321

USER ${F8_USER_NAME}
EXPOSE 8080

CMD /node+pmcd.sh
