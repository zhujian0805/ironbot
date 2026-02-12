# Feature Specification: Windows Service Wrapper using NSSM

**Feature Branch**: `008-nssm-service`
**Created**: 2026-02-12
**Status**: Draft
**Input**: User description: "Wrap IronBot as a Windows service using NSSM, ensure it runs as the current user (jzhu), switch to the project folder as working directory, use the jzhu user's environment variables"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Install IronBot as Windows Service (Priority: P1)

An operations engineer needs to configure IronBot to run as a Windows service so that the application automatically starts when the system boots and runs continuously without manual intervention.

**Why this priority**: This is the core requirement - without service installation, the feature cannot be used. It's critical for production deployment and operational reliability.

**Independent Test**: Can be fully tested by installing the service, rebooting the system, and verifying IronBot is running post-reboot - delivers automated application startup and management capability.

**Acceptance Scenarios**:

1. **Given** NSSM is installed on the Windows system, **When** the installation script is executed, **Then** IronBot is registered as a Windows service with the name "IronBot"
2. **Given** the service is installed, **When** the Windows system is rebooted, **Then** IronBot automatically starts and is accessible
3. **Given** the service is running, **When** the operator views Windows Services, **Then** "IronBot" appears in the service list with status "Running"

---

### User Story 2 - Service Runs with Correct User Context (Priority: P1)

An operations engineer needs the service to run under a specific user account (jzhu) with proper permissions and access to environment variables, ensuring the application can access all necessary resources and credentials.

**Why this priority**: Security and access to resources are critical. The service must run with the correct identity to access user-specific environment variables, configuration files, and credentials.

**Independent Test**: Can be fully tested by verifying the service process runs under the jzhu user account and can access environment variables defined in that user's profile - delivers proper service identity and resource access.

**Acceptance Scenarios**:

1. **Given** the service is running, **When** an operator checks the process properties, **Then** the service process runs under the jzhu user account
2. **Given** the service is installed, **When** IronBot accesses environment variables (e.g., SLACK_BOT_TOKEN, ANTHROPIC_API_KEY), **Then** it successfully retrieves variables from the jzhu user's environment
3. **Given** the service is running, **When** IronBot accesses files in the jzhu user's profile or home directory, **Then** it has appropriate read/write permissions

---

### User Story 3 - Service Uses Project Directory as Working Directory (Priority: P1)

An operations engineer needs the service to execute with the IronBot project folder as the working directory, ensuring all relative file paths (configuration, logs, skill files) are resolved correctly.

**Why this priority**: Configuration and file resolution depend on the correct working directory. This prevents path resolution errors and ensures IronBot can locate configuration files, logs, and skill directories.

**Independent Test**: Can be fully tested by verifying the service uses the project folder as the working directory and can load configuration files using relative paths - delivers correct application file resolution.

**Acceptance Scenarios**:

1. **Given** the service is running, **When** IronBot accesses configuration files (e.g., `permissions.yaml`), **Then** it successfully loads from the project directory without errors
2. **Given** the service is installed, **When** the service is configured, **Then** the working directory is set to the IronBot project folder
3. **Given** the service is running, **When** IronBot writes log files, **Then** logs are written to the expected project directory location

---

### User Story 4 - Service Management Operations (Priority: P2)

An operations engineer needs to start, stop, and check the status of the IronBot service to manage application availability for maintenance and troubleshooting.

**Why this priority**: Post-deployment management is important for operations. While not blocking initial deployment, the ability to control service lifecycle is essential for ongoing operations.

**Independent Test**: Can be fully tested by executing service control commands and verifying state changes - delivers service lifecycle management capability.

**Acceptance Scenarios**:

1. **Given** the service is installed and running, **When** the operator executes the stop command, **Then** IronBot gracefully shuts down within a reasonable timeout
2. **Given** the service is stopped, **When** the operator executes the start command, **Then** IronBot starts successfully and is operational
3. **Given** the service is running, **When** the operator queries service status, **Then** the current state is accurately reported

---

### Edge Cases

- What happens if the jzhu user account doesn't exist on the system?
- How does the service handle startup failures or crashes?
- What happens if the project directory is moved or becomes inaccessible?
- How are environment variable changes in the jzhu user profile propagated to the running service?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide installation mechanism to register IronBot as a Windows service using NSSM
- **FR-002**: System MUST configure the service to run under the jzhu user account with appropriate credentials
- **FR-003**: System MUST set the service working directory to the IronBot project folder
- **FR-004**: System MUST inherit environment variables from the jzhu user's Windows profile when the service starts
- **FR-005**: System MUST automatically start IronBot when Windows boots
- **FR-006**: System MUST handle service startup, stopping, and restart operations reliably
- **FR-007**: System MUST provide uninstallation mechanism to remove the service registration
- **FR-008**: Operators MUST be able to check service status and view recent logs

### Key Entities

- **IronBot Service**: A Windows service wrapper that manages the IronBot application lifecycle
- **NSSM (Non-Sucking Service Manager)**: The service wrapper utility that creates and manages the Windows service
- **Service Configuration**: Settings including service name, user account, working directory, environment variables, and startup parameters
- **jzhu User Account**: The Windows user account under which the service runs, providing access to user-specific environment variables and resources

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: IronBot service installs successfully and appears in Windows Services management console
- **SC-002**: Service starts automatically on Windows system boot without manual intervention
- **SC-003**: Service runs under the jzhu user account as verified by process properties or Task Manager
- **SC-004**: IronBot successfully accesses environment variables from the jzhu user's profile
- **SC-005**: Service uses the project folder as working directory, enabling correct file resolution for configuration files
- **SC-006**: Service can be stopped and restarted using standard Windows service commands
- **SC-007**: All operator workflows (start, stop, status check, view logs) complete successfully

## Assumptions

- NSSM is already installed on the target system (or installation will be handled separately)
- The jzhu user account exists on the system with appropriate permissions
- The project folder path is stable and accessible from the service context
- Environment variables needed by IronBot are defined in the jzhu user's Windows environment
- Standard Windows service management commands are used for lifecycle operations (net start/stop, Services console, or PowerShell)
- The IronBot application is capable of running in a service context without requiring interactive user input

## Scope Boundaries

### In Scope
- Service registration and installation via NSSM
- Configuration of service user context (jzhu account)
- Working directory configuration
- Environment variable inheritance
- Service lifecycle management (start, stop, status)
- Uninstall capability

### Out of Scope
- NSSM installation (assumed to be pre-installed)
- jzhu user account creation or permission management
- Application-level configuration changes
- Monitoring and alerting (beyond status checks)
- Log aggregation or centralized logging
