FROM twilio/twilio-cli:latest
RUN twilio plugins:install @twilio-labs/plugin-flex && CMD tail -f /dev/null