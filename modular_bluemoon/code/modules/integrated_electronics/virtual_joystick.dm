// Proxy datum to handle second UI window. Should prevent shit from breaking if you got circuit UI opened as well.
/datum/virtual_joystick_proxy
	var/obj/item/integrated_circuit/input/virtual_joystick/circuit

/datum/virtual_joystick_proxy/New(circuit)
	. = ..()
	src.circuit = circuit

/datum/virtual_joystick_proxy/Destroy()
	circuit = null
	return ..()

/datum/virtual_joystick_proxy/ui_interact(mob/user, datum/tgui/ui)
	if(!circuit || !circuit.check_interactivity(user))
		return
	ui = SStgui.try_update_ui(user, src, ui)
	if(!ui)
		ui = new(user, src, "VirtualJoystick")
		ui.window_key = "VirtualJoystick-[REF(circuit)]"
		ui.open()

/datum/virtual_joystick_proxy/ui_data(mob/user)
	return list("x" = circuit.joystick_x, "y" = circuit.joystick_y)

/datum/virtual_joystick_proxy/ui_act(action, list/params, datum/tgui/ui)
	if(..())
		return
	switch(action)
		if("update_position")
			circuit.joystick_x = round(clamp(params["x"], -1, 1), 0.01)
			circuit.joystick_y = round(clamp(params["y"], -1, 1), 0.01)
			return TRUE

/datum/virtual_joystick_proxy/ui_close(mob/user)
	. = ..()
	if(circuit)
		circuit.current_proxies -= user

/datum/virtual_joystick_proxy/ui_status(mob/user, datum/ui_state/state)
	if(!circuit || !circuit.check_interactivity(user))
		return UI_CLOSE   // can't interact, don't show
	return UI_INTERACTIVE // allow the window to open

/datum/virtual_joystick_proxy/ui_host(mob/user)
	return user

/obj/item/integrated_circuit/input/virtual_joystick

	name = "virtual joystick"
	desc = "Маленькая сенсорная панель, симулирующая джойстики старого мира"
	extended_desc = "Сенсорный джойстик, полезен для управления ДУ схемами. \
	При пульсации пина read снимает положение ползунка, и выдаёт его в виде относительных координат."
	icon_state = "screen"
	complexity = 5
	outputs = list(
		"X" = IC_PINTYPE_NUMBER,
		"Y" = IC_PINTYPE_NUMBER,
		"combined" = IC_PINTYPE_STRING
	)
	activators = list(
		"read" = IC_PINTYPE_PULSE_IN,
		"on read" = IC_PINTYPE_PULSE_OUT
	)
	spawn_flags = IC_SPAWN_DEFAULT
	power_draw_per_use = 1
	var/joystick_x
	var/joystick_y
	var/list/current_proxies = list()

/obj/item/integrated_circuit/input/virtual_joystick/Destroy()
	for(var/mob/user in current_proxies)
		var/datum/virtual_joystick_proxy/proxy = current_proxies[user]
		SStgui.close_uis(proxy)
		qdel(proxy)
	current_proxies.Cut()
	return ..()

/obj/item/integrated_circuit/input/virtual_joystick/ext_moved(oldLoc, dir)
	. = ..()
	update_joystick_window()

/obj/item/integrated_circuit/input/virtual_joystick/on_data_written()
	. = ..()
	update_joystick_window()

/obj/item/integrated_circuit/input/virtual_joystick/proc/update_joystick_window()
	var/atom/movable/object = get_object()
	var/mob/holder = (ismob(object.loc) ? object.loc : null)

	// Close any proxies that shouldn't be open anymore
	for(var/mob/user in current_proxies)
		var/should_stay = (user == holder)
		if(!should_stay)
			var/datum/virtual_joystick_proxy/proxy = current_proxies[user]
			SStgui.close_uis(proxy)
			qdel(proxy)
			current_proxies -= user

	// Open new proxy for the current holder if appropriate
	if(!holder || current_proxies[holder] || !assembly)
		return
	if(holder.client && check_interactivity(holder))
		var/datum/virtual_joystick_proxy/proxy = new(src)
		current_proxies[holder] = proxy
		proxy.ui_interact(holder)

/obj/item/integrated_circuit/input/virtual_joystick/do_work(ord)
	if(ord == 1)
		set_pin_data(IC_OUTPUT, 1, joystick_x)
		set_pin_data(IC_OUTPUT, 2, joystick_y)
		set_pin_data(IC_OUTPUT, 3, "[joystick_x];[joystick_y]")
		push_data()
		activate_pin(2)
		return TRUE
	return ..()
