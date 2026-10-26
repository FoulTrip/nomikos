################################################################################
#
# agentd — agente de dispositivo NomikOS (Rust, sin deps externas)
#
# Compila el workspace ../firmware con la infra cargo de Buildroot.
# El workspace excluye agentd-esp32 (requiere toolchain xtensa), así que
# `cargo build --release` produce agentd-core + agentd-host: el binario
# agentd-host se instala como /usr/bin/agentd.
#
################################################################################

AGENTD_VERSION = 0.1.0
# buildroot-external/../../firmware = workspace/firmware (local: sin red,
# sin deps → build offline). Con BR2_EXTERNAL vía symlink sin espacios
# (ver nomikos/README.md) la ruta resuelve sin comillas.
AGENTD_SITE = $(BR2_EXTERNAL_NOMIKOS_PATH)/../../firmware
AGENTD_SITE_METHOD = local
AGENTD_LICENSE = MIT
AGENTD_CARGO_PACKAGE = agentd-host
# Sin dependencias: el build es offline y rápido. (La infra cargo-package
# YA compila en --release — no repetirlo en CARGO_BUILD_OPTS.)

define AGENTD_INSTALL_TARGET_CMDS
	$(INSTALL) -D -m 0755 \
		$(@D)/target/$(RUSTC_TARGET_NAME)/release/agentd-host \
		$(TARGET_DIR)/usr/bin/agentd
	mkdir -p $(TARGET_DIR)/var/lib/agentd
endef

$(eval $(cargo-package))
