# Deprecated: api-router Worker

The routing Worker previously served `goldshore.org` and admin hostnames but is no longer deployed now that Pages serves the marketing surfaces directly.

- Do **not** ship new changes from this package.
- Remove the Worker from future infrastructure rollouts.
- Migrate any remaining automation to call the Pages deployments instead of this Worker.

Once the final cleanup completes, this directory can be deleted.
