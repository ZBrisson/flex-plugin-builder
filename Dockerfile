FROM twilio/twilio-cli:latest
RUN twilio plugins:install @twilio-labs/plugin-flex
