# Registra los PAQUETES NomikOS (agentd, whisper-cpp). Los defconfigs
# de configs/ los descubre Buildroot automáticamente — NO incluirlos aquí
# (un defconfig no es un makefile: el include dispara el remake con la
# regla %_defconfig y revienta el build).
include $(sort $(wildcard $(BR2_EXTERNAL_NOMIKOS_PATH)/package/*/*.mk))
